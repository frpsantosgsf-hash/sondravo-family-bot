import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getViewerAccess, mayViewRegistry } from '@/lib/access';
import { syncDiscordBericht } from '@/lib/applications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const voteSchema = z.object({
  applicationId: z.string().uuid('Ongeldige sollicitatie.'),
  // null betekent: haal mijn stem weg.
  vote: z.enum(['ja', 'nee']).nullable(),
});

/**
 * Een lid stemt over een sollicitatie.
 *
 * Alleen wie op de ledenlijst staat mag stemmen, en alleen op eigen naam. Dat
 * wordt hier gecontroleerd én in Row Level Security; deze route kan er dus
 * niet per ongeluk omheen.
 */
export async function POST(request: NextRequest) {
  const access = await getViewerAccess();

  if (!mayViewRegistry(access)) {
    return NextResponse.json({ error: 'Alleen leden mogen stemmen.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON.' }, { status: 400 });
  }

  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Ongeldige gegevens.' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Je sessie is verlopen.' }, { status: 401 });
  }

  const { applicationId, vote } = parsed.data;

  /*
   * Eerst vragen of er nog gestemd mag worden.
   *
   * Bij een insert weigert de database hoorbaar, maar een delete die door de
   * policy wordt tegengehouden raakt gewoon nul rijen en geeft geen fout. Een
   * lid met een oude pagina open kreeg daardoor "gelukt" te zien terwijl zijn
   * stem gewoon bleef staan.
   */
  const { data: magStemmen } = await supabase.rpc('application_accepts_votes', {
    p_id: applicationId,
  });

  if (magStemmen !== true) {
    return NextResponse.json(
      { error: 'Er kan niet meer gestemd worden op deze sollicitatie.' },
      { status: 409 },
    );
  }

  if (vote === null) {
    const { error } = await supabase
      .from('application_votes')
      .delete()
      .eq('application_id', applicationId)
      .eq('voter_id', user.id);

    if (error) {
      return NextResponse.json({ error: 'Je stem intrekken lukte niet.' }, { status: 500 });
    }

    await syncDiscordBericht(applicationId);
    return NextResponse.json({ ok: true });
  }

  // Nog een keer op dezelfde knop drukken verandert je stem in plaats van een
  // tweede rij aan te maken: de sleutel is (sollicitatie, stemmer).
  const { error } = await supabase
    .from('application_votes')
    .upsert(
      { application_id: applicationId, voter_id: user.id, vote },
      { onConflict: 'application_id,voter_id' },
    );

  if (error) {
    return NextResponse.json({ error: 'Stemmen lukte niet.' }, { status: 500 });
  }

  // De stand in het Discord-bericht groeit mee met elke stem.
  await syncDiscordBericht(applicationId);

  return NextResponse.json({ ok: true });
}
