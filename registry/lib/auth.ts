import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

export interface AuthorizedAdmin {
  userId: string;
  name: string;
}

/**
 * Server-side autorisatiecontrole.
 *
 * Dit is de tweede van twee sloten: de eerste is Row Level Security in de
 * database. Knoppen verbergen in de UI is nadrukkelijk géén beveiliging.
 */
export async function requireAdmin(): Promise<
  { ok: true; admin: AuthorizedAdmin } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Supabase is niet geconfigureerd.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: 'Je bent niet ingelogd.' };
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin', {});

  if (adminError) {
    return { ok: false, error: 'Kon je rechten niet controleren.' };
  }

  if (isAdmin !== true) {
    return { ok: false, error: 'Geen toegang. Alleen Lead/Admin accounts mogen wijzigen.' };
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const customClaims = (metadata['custom_claims'] ?? {}) as Record<string, unknown>;
  const name =
    (typeof customClaims['global_name'] === 'string' && customClaims['global_name']) ||
    (typeof metadata['full_name'] === 'string' && metadata['full_name']) ||
    (typeof metadata['name'] === 'string' && metadata['name']) ||
    user.email ||
    'Admin';

  return { ok: true, admin: { userId: user.id, name: String(name) } };
}
