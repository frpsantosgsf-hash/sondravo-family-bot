import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sollicitaties lezen en afhandelen. Alleen voor Lead/Admin.
 *
 * Row Level Security houdt de tabel sowieso dicht; deze controle is de tweede
 * grendel, zodat een fout in één van de twee niet meteen de deur openzet.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: 'Kon de sollicitaties niet ophalen.' }, { status: 500 });
  }

  return NextResponse.json({ applications: data ?? [] });
}

const patchSchema = z.object({
  id: z.string().uuid('Ongeldige sollicitatie.'),
  status: z.enum(['nieuw', 'in_behandeling', 'aangenomen', 'afgewezen']),
  note: z.string().trim().max(1000).optional(),
});

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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Ongeldige gegevens.' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_application_status', {
    p_id: parsed.data.id,
    p_status: parsed.data.status,
    p_note: parsed.data.note ?? null,
  });

  if (error) {
    return NextResponse.json({ error: 'Bijwerken is niet gelukt.' }, { status: 500 });
  }

  revalidatePath('/leden');
  return NextResponse.json({ ok: true });
}
