import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { safeRedirectPath } from '@/lib/redirect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start de Discord-login. Bewust een POST: zo kan een externe pagina niemand
 * ongevraagd door een OAuth-flow sturen via een simpele link.
 */
export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;

  if (!isSupabaseConfigured) {
    return NextResponse.redirect(`${origin}/auth/error?reason=config`, { status: 303 });
  }

  const formData = await request.formData().catch(() => null);
  const next = safeRedirectPath(formData?.get('next'));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/auth/error?reason=oauth`, { status: 303 });
  }

  return NextResponse.redirect(data.url, { status: 303 });
}
