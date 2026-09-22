import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/env';

/**
 * Ververst het Supabase-sessiecookie bij elke request, zodat een ingelogde
 * Lead niet halverwege uitgelogd raakt.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Deze aanroep vernieuwt het token; het resultaat gebruiken we hier niet.
  await supabase.auth.getUser();

  return response;
}
