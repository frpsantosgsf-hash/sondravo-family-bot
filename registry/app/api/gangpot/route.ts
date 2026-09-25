import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getViewerAccess, mayViewRegistry } from '@/lib/access';
import { getGangpotData } from '@/lib/gangpot';
import { syncGangpotBericht } from '@/lib/gangpot-discord';
import { huidigeVrijdag, isDatum, vrijdagVoor } from '@/lib/weken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * De gangpot ophalen.
 *
 * Alleen voor wie zelf op de ledenlijst staat. Row Level Security zou een
 * buitenstaander sowieso lege lijsten geven, maar dan zou het scherm een
 * kloppende lege kas tonen in plaats van eerlijk "geen toegang" te zeggen.
 */
export async function GET() {
  const access = await getViewerAccess();

  if (!mayViewRegistry(access)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 });
  }

  return NextResponse.json(await getGangpotData());
}

/** Een bedrag in in-game geld: hele getallen, en niet absurd groot. */
const bedrag = z
  .number()
  .int('Vul een heel bedrag in.')
  .positive('Het bedrag moet hoger zijn dan nul.')
  .max(1_000_000_000_000, 'Dat bedrag is te groot.');

const datum = z.string().refine(isDatum, 'Ongeldige datum.');
const omschrijving = z.string().trim().min(1, 'Vul een omschrijving in.').max(200);
const naam = z.string().trim().max(120).optional();
const opmerking = z.string().trim().max(500).optional();

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('contribution'),
    memberId: z.string().uuid('Onbekend lid.'),
    friday: datum,
    paid: z.boolean(),
  }),
  z.object({
    action: z.literal('expense'),
    date: datum,
    description: omschrijving,
    who: naam,
    amount: bedrag,
    note: opmerking,
  }),
  z.object({
    action: z.literal('income'),
    date: datum,
    description: omschrijving,
    who: naam,
    amount: bedrag,
    note: opmerking,
  }),
  z.object({
    action: z.literal('delete'),
    kind: z.enum(['expense', 'income']),
    id: z.string().uuid('Onbekende regel.'),
  }),
  z.object({
    action: z.literal('settings'),
    openingBalance: z.number().int().min(0).max(1_000_000_000_000),
    weeklyAmount: bedrag,
  }),
]);

/** Afvinken, boeken en instellen. Alleen de Lead. */
export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Ongeldige gegevens.' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const input = parsed.data;

  if (input.action === 'contribution') {
    /*
     * De datum wordt naar de vrijdag getrokken waarmee die betaalweek begon,
     * in plaats van geweigerd. Zo maakt het niet uit of het scherm de vrijdag
     * of de dag zelf meestuurt, en komt een late betaling altijd in de week
     * waar hij hoort — precies wat de oude spreadsheet met de hand
     * voorschreef ("verwerk een late betaling in de kolom van de
     * oorspronkelijke week").
     */
    const vrijdag = vrijdagVoor(input.friday);

    if (vrijdag > huidigeVrijdag()) {
      return NextResponse.json({ error: 'Die week is nog niet geweest.' }, { status: 400 });
    }

    if (input.paid) {
      // Twee keer afvinken mag niets dubbel boeken; de sleutel is (lid, week).
      const { error } = await supabase
        .from('pot_contributions')
        .upsert(
          { member_id: input.memberId, week_friday: vrijdag },
          { onConflict: 'member_id,week_friday', ignoreDuplicates: true },
        );

      if (error) {
        return NextResponse.json({ error: 'Afvinken lukte niet.' }, { status: 500 });
      }
    } else {
      const { error } = await supabase
        .from('pot_contributions')
        .delete()
        .eq('member_id', input.memberId)
        .eq('week_friday', vrijdag);

      if (error) {
        return NextResponse.json({ error: 'Terugdraaien lukte niet.' }, { status: 500 });
      }
    }

    // Het bericht van díé week groeit mee. Bestaat het nog niet, dan wordt er
    // niets geplaatst: alleen de vrijdagochtendtaak begint een nieuw bericht.
    await syncGangpotBericht(vrijdag);

    revalidatePath('/gangpot');
    return NextResponse.json({ ok: true });
  }

  if (input.action === 'expense' || input.action === 'income') {
    const isUitgave = input.action === 'expense';

    const { error } = isUitgave
      ? await supabase.from('pot_expenses').insert({
          spent_on: input.date,
          description: input.description,
          paid_by: input.who || null,
          amount: input.amount,
          note: input.note || null,
        })
      : await supabase.from('pot_income').insert({
          received_on: input.date,
          description: input.description,
          source: input.who || null,
          amount: input.amount,
          note: input.note || null,
        });

    if (error) {
      return NextResponse.json(
        { error: isUitgave ? 'De uitgave boeken lukte niet.' : 'De inkomst boeken lukte niet.' },
        { status: 500 },
      );
    }

    // Een uitgave verandert het saldo, en dat staat ook in het weekbericht.
    await syncGangpotBericht(huidigeVrijdag());

    revalidatePath('/gangpot');
    return NextResponse.json({ ok: true });
  }

  if (input.action === 'delete') {
    const tabel = input.kind === 'expense' ? 'pot_expenses' : 'pot_income';
    const { error } = await supabase.from(tabel).delete().eq('id', input.id);

    if (error) {
      return NextResponse.json({ error: 'Verwijderen lukte niet.' }, { status: 500 });
    }

    await syncGangpotBericht(huidigeVrijdag());
    revalidatePath('/gangpot');
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from('pot_settings')
    .update({
      opening_balance: input.openingBalance,
      weekly_amount: input.weeklyAmount,
    })
    .eq('id', 1);

  if (error) {
    return NextResponse.json({ error: 'De instellingen opslaan lukte niet.' }, { status: 500 });
  }

  await syncGangpotBericht(huidigeVrijdag());
  revalidatePath('/gangpot');
  return NextResponse.json({ ok: true });
}
