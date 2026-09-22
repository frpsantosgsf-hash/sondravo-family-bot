'use server';

import { createClient } from '@/lib/supabase/server';
import { getViewerAccess, mayApply } from '@/lib/access';
import {
  applicationSchema,
  applicationsAreOpen,
  notifyDiscord,
  onthoudDiscordBericht,
  saveApplication,
} from '@/lib/applications';

/** De velden zoals ze zijn ingetypt, ruw. */
export type ApplicationValues = Record<
  'name' | 'age' | 'phone' | 'motivation' | 'experience' | 'availability',
  string
>;

/**
 * Bij een fout gaan de ingevulde waarden mee terug.
 *
 * Zonder dat staat iemand die één veld verkeerd invult opeens voor een leeg
 * formulier, en is het verhaal dat hij net typte weg. Dat gebeurt precies bij
 * degene die er moeite voor deed.
 */
export type ApplicationFormState =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; values: ApplicationValues };

function readValues(formData: FormData): ApplicationValues {
  const lees = (veld: string) => {
    const waarde = formData.get(veld);
    return typeof waarde === 'string' ? waarde : '';
  };

  return {
    name: lees('name'),
    age: lees('age'),
    phone: lees('phone'),
    motivation: lees('motivation'),
    experience: lees('experience'),
    availability: lees('availability'),
  };
}

/**
 * Neemt een sollicitatie aan.
 *
 * De rolcontrole staat hier, aan de serverkant. De knop verbergen in de UI is
 * geen beveiliging: wie het adres kent kan het formulier gewoon posten.
 */
export async function submitApplicationAction(
  _state: ApplicationFormState | null,
  formData: FormData,
): Promise<ApplicationFormState> {
  const values = readValues(formData);
  const access = await getViewerAccess();

  if (!access.signedIn) {
    return { ok: false, error: 'Log eerst in met Discord.', values };
  }

  // De deur kan dicht staan omdat de familie vol zit. Ook dat wordt hier
  // gecontroleerd en niet alleen in de pagina: het formulier posten kan
  // iedereen die het adres kent.
  if (!(await applicationsAreOpen())) {
    return {
      ok: false,
      error: 'De sollicitaties zijn op dit moment gesloten.',
      values,
    };
  }

  if (access.discordUnavailable) {
    return {
      ok: false,
      error: 'Discord is even niet bereikbaar, dus je rol kan niet gecontroleerd worden.',
      values,
    };
  }

  if (!mayApply(access)) {
    return {
      ok: false,
      error: 'Je hebt de juiste Discord-rol niet om te kunnen solliciteren.',
      values,
    };
  }

  const parsed = applicationSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const veld = issue.path[0];
      if (typeof veld === 'string' && !fieldErrors[veld]) fieldErrors[veld] = issue.message;
    }
    return { ok: false, error: 'Niet alles is goed ingevuld.', fieldErrors, values };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Je sessie is verlopen. Log opnieuw in.', values };
  }

  const opgeslagen = await saveApplication(parsed.data, access, user.id);
  if (!opgeslagen.ok) {
    return { ok: false, error: opgeslagen.error, values };
  }

  // De melding in Discord mag de inzending nooit laten mislukken. Het
  // bericht-ID onthouden we wel, zodat het bericht later weer uit het kanaal
  // kan verdwijnen als de Lead de sollicitatie archiveert.
  const messageId = await notifyDiscord({
    name: parsed.data.name,
    status: 'nieuw',
    age: parsed.data.age,
    phone: parsed.data.phone ?? null,
    motivation: parsed.data.motivation,
    experience: parsed.data.experience ?? null,
    availability: parsed.data.availability ?? null,
    discord_user_id: access.discord.userId,
    avatar_url: access.discord.avatarUrl,
    handled_by: null,
    voting_closed: false,
  });
  if (messageId) {
    await onthoudDiscordBericht(opgeslagen.id, messageId, null);
  }

  /*
   * Bewust géén revalidatePath('/solliciteren'): die liet de pagina opnieuw
   * laden, waardoor het formulier opnieuw werd opgebouwd en de bevestiging
   * meteen weer van het scherm verdween. Je zag dan een leeg formulier en
   * wist niet of je inzending was aangekomen.
   *
   * De Lead haalt zijn overzicht met cache: 'no-store' op, dus daar is niets
   * ongeldig te maken.
   */

  return { ok: true, message: 'Je sollicitatie is verstuurd. Een Lead kijkt ernaar.' };
}
