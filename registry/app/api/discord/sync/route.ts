import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fetchDiscordProfile, isDiscordSyncEnabled } from '@/lib/discord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SyncResult {
  updated: number;
  checked: number;
  leftServer: string[];
}

/**
 * Optionele Discord-sync: haalt weergavenaam en avatar op voor elk lid waar
 * een Discord user ID bij staat.
 *
 * Alleen bereikbaar voor ingelogde admins. De schrijfacties gaan via de
 * sessie van de admin, zodat de audit log de juiste persoon registreert.
 */
export async function POST() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 });
  }

  if (!isDiscordSyncEnabled()) {
    return NextResponse.json(
      { error: 'Discord-sync staat uit. Zet DISCORD_BOT_TOKEN en DISCORD_GUILD_ID om hem aan te zetten.' },
      { status: 409 },
    );
  }

  const supabase = await createClient();
  const { data: privateRows, error } = await supabase
    .from('private_member_data')
    .select('member_id, discord_user_id')
    .not('discord_user_id', 'is', null);

  if (error) {
    return NextResponse.json({ error: 'Kon de Discord-koppelingen niet ophalen.' }, { status: 500 });
  }

  const result: SyncResult = { updated: 0, checked: 0, leftServer: [] };

  for (const row of privateRows ?? []) {
    if (!row.discord_user_id) continue;
    result.checked += 1;

    let profile = null;
    try {
      profile = await fetchDiscordProfile(row.discord_user_id);
    } catch {
      continue; // Eén mislukte lookup mag de hele sync niet stoppen.
    }
    if (!profile) continue;

    const { data: member } = await supabase
      .from('members')
      .select('id, name')
      .eq('id', row.member_id)
      .maybeSingle();

    if (!profile.inGuild) {
      if (member?.name) result.leftServer.push(member.name);
      continue;
    }

    const patch: { discord_username?: string; avatar_url?: string } = {};
    if (profile.username) patch.discord_username = profile.username;
    if (profile.avatarUrl) patch.avatar_url = profile.avatarUrl;

    if (Object.keys(patch).length === 0) continue;

    const { error: updateError } = await supabase
      .from('members')
      .update(patch)
      .eq('id', row.member_id);

    if (!updateError) result.updated += 1;
  }

  revalidatePath('/');
  revalidatePath('/leden');

  return NextResponse.json(result);
}
