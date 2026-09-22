import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fetchGuildMembers, isDiscordSyncEnabled, normalizeName } from '@/lib/discord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Onder deze lengte zoeken we niet op gelijkenis: te veel toevalstreffers. */
const MIN_LENGTE_VOOR_GELIJKENIS = 3;

interface Kandidaat {
  discordUserId: string;
  username: string;
  avatarUrl: string | null;
  /** Naam en bijnaam, allebei kaalgemaakt met normalizeName. */
  namen: string[];
}

/**
 * Zoekt de Discord-accounts die bij een naam horen, in drie rondes die steeds
 * losser worden. Er wordt pas naar de volgende ronde gekeken als de vorige
 * niets oplevert, zodat een exacte naam het altijd wint van een gelijkende.
 */
function zoekKandidaten(naam: string, kandidaten: Kandidaat[]): {
  treffers: Kandidaat[];
  exact: boolean;
} {
  const exact = kandidaten.filter((k) => k.namen.includes(naam));
  if (exact.length > 0) return { treffers: exact, exact: true };

  if (naam.length < MIN_LENGTE_VOOR_GELIJKENIS) return { treffers: [], exact: false };

  // "Ryan" vindt "RyanSondravo", en "SDF Ryan" vindt "Ryan".
  const begint = kandidaten.filter((k) =>
    k.namen.some(
      (n) =>
        n.length >= MIN_LENGTE_VOOR_GELIJKENIS &&
        (n.startsWith(naam) || naam.startsWith(n)),
    ),
  );
  if (begint.length > 0) return { treffers: begint, exact: false };

  // Laatste ronde: de naam zit ergens middenin, zoals "xXDaveXx".
  const bevat = kandidaten.filter((k) =>
    k.namen.some(
      (n) => n.length >= MIN_LENGTE_VOOR_GELIJKENIS && (n.includes(naam) || naam.includes(n)),
    ),
  );
  return { treffers: bevat, exact: false };
}

/**
 * Koppelt de ledenlijst in één keer aan de Discord-server.
 *
 * Zoekt voor elk lid het Discord-account met dezelfde naam en zet daarna het
 * account-ID, de handle en de avatar vast. Vanaf dat moment houdt de gewone
 * sync alles bij.
 *
 * Koppelt alleen bij een ondubbelzinnige match: levert een naam meer dan één
 * Discord-account op, dan blijft dat lid met rust. Liever een lid dat je zelf
 * moet koppelen dan een verkeerd gezicht op de lijst. Leden die alleen op
 * gelijkenis zijn gevonden worden apart teruggemeld, zodat je die even kunt
 * nalopen.
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

  const kandidaten: Kandidaat[] = guildLeden.map((lid) => ({
    discordUserId: lid.discordUserId,
    username: lid.username,
    avatarUrl: lid.avatarUrl,
    namen: [...new Set([normalizeName(lid.displayName), normalizeName(lid.username)])].filter(
      Boolean,
    ),
  }));

  const gekoppeld: string[] = [];
  const viaGelijkenis: string[] = [];
  const nietGevonden: string[] = [];
  const meerdereOpties: string[] = [];

  for (const lid of leden) {
    const { treffers, exact } = zoekKandidaten(normalizeName(lid.name), kandidaten);

    if (treffers.length === 0) {
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
    if (!exact) viaGelijkenis.push(`${lid.name} -> @${match.username}`);
  }

  revalidatePath('/');
  revalidatePath('/leden');

  return NextResponse.json({
    gekoppeld: gekoppeld.length,
    namen: gekoppeld,
    viaGelijkenis,
    nietGevonden,
    meerdereOpties,
    discordLeden: guildLeden.length,
  });
}
