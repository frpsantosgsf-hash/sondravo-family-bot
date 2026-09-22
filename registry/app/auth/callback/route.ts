import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { safeRedirectPath } from '@/lib/redirect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Wisselt de OAuth-code om voor een sessie en stuurt de bezoeker terug. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const next = safeRedirectPath(url.searchParams.get('next'));

  if (url.searchParams.get('error')) {
    return NextResponse.redirect(`${origin}/auth/error?reason=denied`);
  }

  if (!code || !isSupabaseConfigured) {
    return NextResponse.redirect(`${origin}/auth/error?reason=oauth`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
