import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { safeRedirectPath } from '@/lib/redirect';
import { discordIdFromMetadata, syncAdminFromDiscord } from '@/lib/admin-sync';

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
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange`);
  }

  // Beheerrechten volgen de Leader-rol in Discord. Dat wordt hier gecontroleerd,
  // precies één keer per login. Een fout mag de login nooit tegenhouden.
  const user = data?.user;
  if (user) {
    try {
      const metadata = user.user_metadata as Record<string, unknown> | undefined;
      await syncAdminFromDiscord(user.id, discordIdFromMetadata(metadata));
    } catch {
      // Rechten blijven dan staan zoals ze waren.
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
