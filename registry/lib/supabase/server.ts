import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { supabaseAnonKey, supabaseUrl } from '@/lib/env';

/**
 * Serverclient met de sessie van de bezoeker. Draait onder de anon key, dus
 * RLS bepaalt wat deze client mag — ook wanneer de bezoeker een admin is.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // In een Server Component mag je geen cookies zetten. De middleware
          // ververst de sessie al, dus dit mag genegeerd worden.
        }
      },
    },
  });
}
