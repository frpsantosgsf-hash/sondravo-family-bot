import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ open: z.boolean() });

/** De deur voor nieuwe sollicitaties open- of dichtzetten. Alleen de Lead. */
export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ongeldige gegevens.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_applications_open', {
    p_open: parsed.data.open,
  });

  if (error) {
    return NextResponse.json({ error: 'Bijwerken is niet gelukt.' }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath('/solliciteren');
  return NextResponse.json({ ok: true });
}
