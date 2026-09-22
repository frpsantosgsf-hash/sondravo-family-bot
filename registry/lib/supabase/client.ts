'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { supabaseAnonKey, supabaseUrl } from '@/lib/env';

/**
 * Browserclient. Gebruikt uitsluitend de anon key — die mag publiek zijn,
 * want alle rechten worden door Row Level Security bepaald.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
