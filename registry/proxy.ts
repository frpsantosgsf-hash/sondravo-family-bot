import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/session';

/**
 * Draait vóór elke request (in Next 16 heet dit "proxy", voorheen middleware).
 * Het enige doel hier is het Supabase-sessiecookie verversen.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Alles behalve statische bestanden, afbeeldingen en media.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ico)$).*)',
  ],
};
