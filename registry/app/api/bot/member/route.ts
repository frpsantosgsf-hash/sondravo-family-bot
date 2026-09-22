import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Endpoint voor de Discord-bot (/new en /verwijder).
 *
 * De bot authenticeert met één gedeeld geheim in de header
 * `x-sondravo-bot-secret`. Dat geheim staat alleen in de environment van
 * Vercel en van de bot — nooit in de browser.
 *
 * Schrijven gebeurt via de service-role client, die daarom uitsluitend achter
 * deze geheim-controle staat en nergens anders gebruikt wordt.
 */

const payloadSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    discordUserId: z.string().regex(/^[0-9]{5,32}$/, 'Ongeldig Discord user ID.'),
    name: z.string().trim().min(1).max(64),
    discordUsername: z.string().trim().max(64).optional().nullable(),
    rank: z.string().trim().min(1).max(48).optional(),
    avatarUrl: z.string().trim().max(512).optional().nullable(),
    actor: z.string().trim().max(64).optional(),
  }),
  z.object({
    action: z.literal('remove'),
    discordUserId: z.string().regex(/^[0-9]{5,32}$/, 'Ongeldig Discord user ID.'),
    actor: z.string().trim().max(64).optional(),
  }),
]);

function secretMatches(provided: string | null): boolean {
  const expected = process.env.BOT_API_SECRET;
  if (!expected || !provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get('x-sondravo-bot-secret'))) {
    return NextResponse.json({ error: 'Niet geautoriseerd.' }, { status: 401 });
  }

  if (!isSupabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server is niet volledig geconfigureerd.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON.' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Ongeldige gegevens.' },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const supabase = createAdminClient();

  if (input.action === 'remove') {
    const { data, error } = await supabase.rpc('bot_remove_member', {
      p_discord_user_id: input.discordUserId,
      p_actor: input.actor ?? 'Discord bot',
    });

    if (error) {
      return NextResponse.json({ error: 'Verwijderen mislukt.' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Dit Discord-account staat niet in het register.' }, { status: 404 });
    }

    revalidatePath('/');
    revalidatePath('/leden');
    return NextResponse.json({ ok: true, removed: data });
  }

  const { data, error } = await supabase.rpc('bot_add_member', {
    p_discord_user_id: input.discordUserId,
    p_name: input.name,
    p_discord_username: input.discordUsername ?? null,
    p_rank: input.rank ?? 'zazavao',
    p_avatar_url: input.avatarUrl ?? null,
    p_actor: input.actor ?? 'Discord bot',
  });

  if (error) {
    const message = error.code === '22023' ? error.message : 'Toevoegen mislukt.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;

  revalidatePath('/');
  revalidatePath('/leden');

  return NextResponse.json({
    ok: true,
    created: row?.created ?? false,
    memberId: row?.member_id ?? null,
  });
}
