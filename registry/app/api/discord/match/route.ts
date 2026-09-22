import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fetchGuildMembers, isDiscordSyncEnabled, normalizeName } from '@/lib/discord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Koppelt de ledenlijst in één keer aan de Discord-server.
 *
 * Zoekt voor elk lid het Discord-account met dezelfde naam en zet daarna het
 * account-ID, de handle en de avatar vast. Vanaf dat moment houdt de gewone
 * sync alles bij.
 *
 * Koppelt alleen bij een ondubbelzinnige match: levert een naam meer dan één
 * Discord-account op, dan blijft dat lid met rust. Liever een lid dat je zelf
 * moet koppelen dan een verkeerd gezicht op de lijst.
 */
export async function POST() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 });
  }

  if (!isDiscordSyncEnabled()) {
    return NextResponse.json(
      { error: 'Discord-koppeling staat uit. Zet DISCORD_BOT_TOKEN en DISCORD_GUILD_ID in Vercel.' },
      { status: 409 },
    );
  }

  const guildLeden = await fetchGuildMembers();
  if (!guildLeden) {
    return NextResponse.json(
      { error: 'Kon de Discord-server niet uitlezen. Staat SERVER MEMBERS INTENT aan bij je bot?' },
      { status: 502 },
    );
  }

  const supabase = await createClient();
  const { data: leden, error } = await supabase.from('members').select('id, name');

  if (error || !leden) {
    return NextResponse.json({ error: 'Kon de ledenlijst niet ophalen.' }, { status: 500 });
  }

  // Een naam die bij meerdere Discord-accounts hoort, is geen match.
  const opNaam = new Map<string, typeof guildLeden>();
  for (const lid of guildLeden) {
    for (const naam of new Set([normalizeName(lid.displayName), normalizeName(lid.username)])) {
      if (!naam) continue;
      const bestaand = opNaam.get(naam);
      if (bestaand) {
        bestaand.push(lid);
      } else {
        opNaam.set(naam, [lid]);
      }
    }
  }

  const gekoppeld: string[] = [];
  const nietGevonden: string[] = [];
  const meerdereOpties: string[] = [];

  for (const lid of leden) {
    const treffers = opNaam.get(normalizeName(lid.name));

    if (!treffers || treffers.length === 0) {
      nietGevonden.push(lid.name);
      continue;
    }
    if (treffers.length > 1) {
      meerdereOpties.push(lid.name);
      continue;
    }

    const match = treffers[0]!;

    const patch: { discord_username: string; avatar_url?: string } = {
      discord_username: match.username,
    };
    if (match.avatarUrl) patch.avatar_url = match.avatarUrl;

    const { error: updateError } = await supabase.from('members').update(patch).eq('id', lid.id);
    if (updateError) continue;

    // Bestaat er al een privérij, dan alleen het account-ID bijwerken — een
    // interne notitie mag hier niet door verdwijnen.
    const { data: bestaand } = await supabase
      .from('private_member_data')
      .select('member_id')
      .eq('member_id', lid.id)
      .maybeSingle();

    if (bestaand) {
      await supabase
        .from('private_member_data')
        .update({ discord_user_id: match.discordUserId, updated_at: new Date().toISOString() })
        .eq('member_id', lid.id);
    } else {
      await supabase
        .from('private_member_data')
        .insert({ member_id: lid.id, discord_user_id: match.discordUserId });
    }

    gekoppeld.push(lid.name);
  }

  revalidatePath('/');
  revalidatePath('/leden');

  return NextResponse.json({
    gekoppeld: gekoppeld.length,
    namen: gekoppeld,
    nietGevonden,
    meerdereOpties,
    discordLeden: guildLeden.length,
  });
}
