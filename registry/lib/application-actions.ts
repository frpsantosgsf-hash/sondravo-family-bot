'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getViewerAccess, mayApply } from '@/lib/access';
import { applicationSchema, notifyDiscord, saveApplication } from '@/lib/applications';
import type { ActionResult } from '@/types';

/**
 * Neemt een sollicitatie aan.
 *
 * De rolcontrole staat hier, aan de serverkant. De knop verbergen in de UI is
 * geen beveiliging: wie het adres kent kan het formulier gewoon posten.
 */
export async function submitApplicationAction(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const access = await getViewerAccess();

  if (!access.signedIn) {
    return { ok: false, error: 'Log eerst in met Discord.' };
  }

  if (access.discordUnavailable) {
    return {
      ok: false,
      error: 'Discord is even niet bereikbaar, dus je rol kan niet gecontroleerd worden.',
    };
  }

  if (!mayApply(access)) {
    return { ok: false, error: 'Je hebt de juiste Discord-rol niet om te kunnen solliciteren.' };
  }

  const parsed = applicationSchema.safeParse({
    name: formData.get('name') ?? '',
    age: formData.get('age') ?? '',
    phone: formData.get('phone') ?? '',
    motivation: formData.get('motivation') ?? '',
    experience: formData.get('experience') ?? '',
    availability: formData.get('availability') ?? '',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const veld = issue.path[0];
      if (typeof veld === 'string' && !fieldErrors[veld]) fieldErrors[veld] = issue.message;
    }
    return { ok: false, error: 'Niet alles is goed ingevuld.', fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Je sessie is verlopen. Log opnieuw in.' };
  }

  const opgeslagen = await saveApplication(parsed.data, access, user.id);
  if (!opgeslagen.ok) {
    return { ok: false, error: opgeslagen.error };
  }

  // De melding in Discord mag de inzending nooit laten mislukken.
  await notifyDiscord(parsed.data, access);

  revalidatePath('/solliciteren');
  revalidatePath('/leden');

  return { ok: true, message: 'Je sollicitatie is verstuurd. Een Lead kijkt ernaar.' };
}
