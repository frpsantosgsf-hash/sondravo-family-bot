import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { checkAdminRole, isRoleSyncEnabled } from '@/lib/discord';
import { isSupabaseConfigured } from '@/lib/env';

/**
 * Houdt de admins-tabel in de pas met de Leader-rol in Discord.
 *
 * Draait één keer per login, server-side. Wie de rol heeft, krijgt een rij met
 * source = 'discord'; wie hem kwijt is, raakt die rij weer kwijt.
 *
 * Handmatige admins (source = 'manual') worden nooit aangeraakt. Dat is met
 * opzet: als het bot-token stuk is of Discord plat ligt, moet er altijd nog
 * iemand binnen kunnen. Om diezelfde reden doet deze functie niets zodra de
 * rolcontrole geen uitsluitsel geeft.
 */
export async function syncAdminFromDiscord(
  supabaseUserId: string,
  discordUserId: string | null,
): Promise<void> {
  if (!isSupabaseConfigured || !isRoleSyncEnabled()) return;
  if (!discordUserId || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const check = await checkAdminRole(discordUserId);
  if (check.status === 'unknown') return;

  const supabase = createAdminClient();

  if (check.status === 'admin') {
    await supabase
      .from('admins')
      .upsert({ user_id: supabaseUserId, source: 'discord' }, { onConflict: 'user_id' });
    return;
  }

  // Rol kwijt: alleen de automatisch toegekende rij verdwijnt.
  await supabase
    .from('admins')
    .delete()
    .eq('user_id', supabaseUserId)
    .eq('source', 'discord');
}

/** Haalt het Discord-account-ID uit de metadata die Supabase bij de login opsloeg. */
export function discordIdFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;

  for (const key of ['provider_id', 'sub']) {
    const value = metadata[key];
    if (typeof value === 'string' && /^[0-9]{5,32}$/.test(value)) return value;
  }
  return null;
}
