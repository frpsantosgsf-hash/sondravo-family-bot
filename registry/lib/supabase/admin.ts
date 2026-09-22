import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getServiceRoleKey, supabaseUrl } from '@/lib/env';

/**
 * Service-role client. Omzeilt RLS en mag daarom NOOIT in de browser komen.
 * Wordt alleen gebruikt door server-only taken (Discord-sync).
 *
 * Elk aanroeppunt moet zélf eerst controleren of de gebruiker admin is.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(supabaseUrl, getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
