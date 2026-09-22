import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getViewerAccess, mayViewRegistry } from '@/lib/access';
import {
  notifyDiscordStatus,
  onthoudDiscordBericht,
  verwijderDiscordBericht,
} from '@/lib/applications';
import type { ApplicationRow } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** De stand van de stemming bij één sollicitatie. */
export interface VoteTally {
  ja: number;
  nee: number;
  /** Wat de bezoeker zelf gestemd heeft, of null. */
  mine: 'ja' | 'nee' | null;
}

/**
 * Sollicitaties ophalen.
 *
 * Een Lead ziet alles, inclusief wat al is afgehandeld. Een lid ziet alleen
 * wat nog openstaat — Row Level Security zorgt daarvoor, deze route hoeft dat
 * niet na te bouwen. Afgewezen sollicitaties blijven zo binnen de leiding.
 */
export async function GET(request: NextRequest) {
  const access = await getViewerAccess();

  if (!mayViewRegistry(access)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 });
  }

  // Het archief is alleen voor de Lead. Een lid dat het adres raadt krijgt
  // gewoon zijn eigen lijst: RLS laat hem geen gearchiveerde rij zien.
  const wilArchief =
    new URL(request.url).searchParams.get('archief') === '1' && access.isAdmin;

  const supabase = await createClient();
  const query = supabase.from('applications').select('*');

  const { data, error } = await (wilArchief
    ? query.not('archived_at', 'is', null)
    : query.is('archived_at', null)
  )
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: 'Kon de sollicitaties niet ophalen.' }, { status: 500 });
  }

  const applications = (data ?? []) as ApplicationRow[];
  const votes = await tallyVotes(supabase, applications);

  return NextResponse.json({ applications, votes, isAdmin: access.isAdmin });
}

/** Telt de stemmen per sollicitatie, en onthoudt wat je zelf koos. */
async function tallyVotes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  applications: ApplicationRow[],
): Promise<Record<string, VoteTally>> {
  const tally: Record<string, VoteTally> = {};
  if (applications.length === 0) return tally;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = await supabase
    .from('application_votes')
    .select('application_id, voter_id, vote')
    .in(
      'application_id',
      applications.map((row) => row.id),
    );

  for (const application of applications) {
    tally[application.id] = { ja: 0, nee: 0, mine: null };
  }

  for (const row of rows ?? []) {
    const stand = tally[row.application_id];
    if (!stand) continue;

    if (row.vote === 'ja') stand.ja += 1;
    if (row.vote === 'nee') stand.nee += 1;
    if (user && row.voter_id === user.id) {
      stand.mine = row.vote === 'ja' ? 'ja' : 'nee';
    }
  }

  return tally;
}

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('status'),
    id: z.string().uuid('Ongeldige sollicitatie.'),
    status: z.enum(['nieuw', 'in_behandeling', 'aangenomen', 'afgewezen']),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal('voting'),
    id: z.string().uuid('Ongeldige sollicitatie.'),
    closed: z.boolean(),
  }),
  z.object({
    action: z.literal('archive'),
    id: z.string().uuid('Ongeldige sollicitatie.'),
  }),
]);

/**
 * Afhandelen, stemming sluiten of archiveren. Alleen de Lead.
 *
 * Stemmen van leden zijn advies; het besluit ligt hier. Archiveren haalt de
 * sollicitatie uit beeld bij de leden én ruimt de berichten in Discord op,
 * zodat het kanaal niet volloopt met afgehandelde zaken.
 */
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Ongeldige gegevens.' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const input = parsed.data;

  if (input.action === 'voting') {
    const { error } = await supabase.rpc('admin_set_voting_closed', {
      p_id: input.id,
      p_closed: input.closed,
    });

    if (error) {
      return NextResponse.json({ error: 'De stemming bijwerken lukte niet.' }, { status: 500 });
    }

    revalidatePath('/sollicitaties');
    return NextResponse.json({ ok: true });
  }

  if (input.action === 'archive') {
    // Eerst de bericht-ID's ophalen: na het archiveren zijn ze nog wel te
    // lezen, maar zo staat alles wat we nodig hebben in één keer klaar.
    const { data: voor } = await supabase
      .from('applications')
      .select('discord_message_id, discord_status_message_id')
      .eq('id', input.id)
      .maybeSingle();

    const { error } = await supabase.rpc('admin_archive_application', { p_id: input.id });

    if (error) {
      return NextResponse.json({ error: 'Archiveren lukte niet.' }, { status: 500 });
    }

    await verwijderDiscordBericht(voor?.discord_message_id ?? null);
    await verwijderDiscordBericht(voor?.discord_status_message_id ?? null);

    revalidatePath('/sollicitaties');
    revalidatePath('/leden');
    return NextResponse.json({ ok: true });
  }

  const { data: row, error } = await supabase.rpc('admin_set_application_status', {
    p_id: input.id,
    p_status: input.status,
    p_note: input.note ?? null,
  });

  if (error) {
    return NextResponse.json({ error: 'Bijwerken is niet gelukt.' }, { status: 500 });
  }

  // Het kanaal in Discord hoort de uitkomst ook te zien, met de stand van de
  // stemming erbij. Mislukt die melding, dan is het besluit nog steeds genomen.
  if (row) {
    const { data: stemRijen } = await supabase
      .from('application_votes')
      .select('vote')
      .eq('application_id', input.id);

    const messageId = await notifyDiscordStatus(row, {
      ja: (stemRijen ?? []).filter((stem) => stem.vote === 'ja').length,
      nee: (stemRijen ?? []).filter((stem) => stem.vote === 'nee').length,
    });

    if (messageId) {
      // Een vorige statusmelding vervangen we: anders staan er bij een besluit
      // dat twee keer wisselt drie berichten over dezelfde persoon.
      await verwijderDiscordBericht(row.discord_status_message_id);
      await onthoudDiscordBericht(input.id, null, messageId);
    }
  }

  revalidatePath('/leden');
  revalidatePath('/sollicitaties');
  return NextResponse.json({ ok: true });
}
