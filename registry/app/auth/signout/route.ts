import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { safeRedirectPath } from '@/lib/redirect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const formData = await request.formData().catch(() => null);
  const next = safeRedirectPath(formData?.get('next'));

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(`${origin}${next}`, { status: 303 });
}
