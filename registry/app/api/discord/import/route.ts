import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getMemberRoleId } from '@/lib/env';
import {
  fetchGuildMembers,
  fetchGuildRoles,
  isDiscordSyncEnabled,
  normalizeName,
} from '@/lib/discord';
import { DEFAULT_RANK_KEY, RANK_LADDER } from '@/lib/ranks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Haalt de ledenlijst rechtstreeks uit de Discord-rollen.
 *
 * De familierol is hier de bron van waarheid: wie die rol draagt hoort op de
 * lijst, en de rangrol die iemand daarnaast heeft bepaalt zijn plek. Daarmee
 * is het raden op namen van de baan — die gok koppelde twee mensen met een
 * gelijkende naam aan elkaar.
 *
 * Er wordt nooit iemand verwijderd. Raakt iemand zijn rol kwijt, dan komt hij
 * in het rapport te staan en beslis jij wat ermee gebeurt.
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

  const memberRoleId = getMemberRoleId();
  if (!memberRoleId) {
    return NextResponse.json(
      { error: 'Zet DISCORD_MEMBER_ROLE_ID in Vercel op de rol-ID van de familierol.' },
      { status: 409 },
    );
  }

  const [guildLeden, guildRollen] = await Promise.all([fetchGuildMembers(), fetchGuildRoles()]);

  if (!guildLeden || !guildRollen) {
    return NextResponse.json(
      { error: 'Kon de Discord-server niet uitlezen. Staat SERVER MEMBERS INTENT aan bij je bot?' },
      { status: 502 },
    );
  }

  if (!guildRollen.has(memberRoleId)) {
    return NextResponse.json(
      { error: 'De familierol uit DISCORD_MEMBER_ROLE_ID bestaat niet in deze server.' },
      { status: 409 },
    );
  }

  // Rangrollen worden op naam herkend, niet op ID. Zo hoeft er voor negen
  // rangen geen rijtje ID's in de environment te staan dat bij elke nieuwe
  // server opnieuw goed gezet moet worden.
  const rangPerRolId = new Map<string, { key: string; sortOrder: number }>();
  for (const [rolId, rolNaam] of guildRollen) {
    const kaal = normalizeName(rolNaam);
    const rang = RANK_LADDER.find((r) => normalizeName(r.label) === kaal || r.key === kaal);
    if (rang) rangPerRolId.set(rolId, { key: rang.key, sortOrder: rang.sortOrder });
  }

  const supabase = await createClient();

  const [{ data: leden, error: ledenError }, { data: koppelingen }] = await Promise.all([
    supabase.from('members').select('id, name, rank'),
    supabase.from('private_member_data').select('member_id, discord_user_id'),
  ]);

  if (ledenError || !leden) {
    return NextResponse.json({ error: 'Kon de ledenlijst niet ophalen.' }, { status: 500 });
  }

  // Wie staat er al op de lijst, en onder welk Discord-account?
  const ledenOpDiscordId = new Map<string, (typeof leden)[number]>();
  for (const koppeling of koppelingen ?? []) {
    if (!koppeling.discord_user_id) continue;
    const lid = leden.find((l) => l.id === koppeling.member_id);
    if (lid) ledenOpDiscordId.set(koppeling.discord_user_id, lid);
  }

  const toegevoegd: string[] = [];
  const rangAangepast: string[] = [];
  const zonderRangrol: string[] = [];
  const mislukt: string[] = [];
  let ongewijzigd = 0;

  const metFamilierol = guildLeden.filter((lid) => lid.roleIds.includes(memberRoleId));

  for (const discordLid of metFamilierol) {
    // De hoogste rang wint, zodat iemand met twee rangrollen niet op de
    // laagste belandt.
    const rangen = discordLid.roleIds
      .map((rolId) => rangPerRolId.get(rolId))
      .filter((rang): rang is { key: string; sortOrder: number } => rang !== undefined)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const rang = rangen[0]?.key ?? DEFAULT_RANK_KEY;
    if (rangen.length === 0) zonderRangrol.push(discordLid.displayName);

    const bestaand = ledenOpDiscordId.get(discordLid.discordUserId);

    if (bestaand) {
      const patch: { rank?: string; avatar_url?: string; discord_username?: string } = {
        discord_username: discordLid.username,
      };
      if (bestaand.rank !== rang) patch.rank = rang;
      if (discordLid.avatarUrl) patch.avatar_url = discordLid.avatarUrl;

      const { error } = await supabase.from('members').update(patch).eq('id', bestaand.id);

      if (error) {
        mislukt.push(bestaand.name);
      } else if (patch.rank) {
        rangAangepast.push(`${bestaand.name}: ${bestaand.rank} -> ${rang}`);
      } else {
        ongewijzigd += 1;
      }
      continue;
    }

    // Nieuw lid. De servernaam wordt de naam op de lijst, zodat de site
    // dezelfde namen toont als Discord.
    const { data: nieuwId, error } = await supabase.rpc('admin_save_member', {
      p_id: null,
      p_name: discordLid.displayName.slice(0, 64),
      p_rank: rang,
      p_discord_username: discordLid.username,
      p_discord_user_id: discordLid.discordUserId,
      p_phone: null,
      p_avatar_url: discordLid.avatarUrl,
      p_joined_at: null,
      p_internal_note: null,
    });

    if (error || !nieuwId) {
      mislukt.push(discordLid.displayName);
      continue;
    }

    toegevoegd.push(discordLid.displayName);
  }

  // Leden op de lijst die de familierol niet (meer) dragen. Alleen melden:
  // iemand van de lijst halen is een beslissing van een mens.
  const idsMetRol = new Set(metFamilierol.map((lid) => lid.discordUserId));
  const zonderFamilierol = [...ledenOpDiscordId.entries()]
    .filter(([discordId]) => !idsMetRol.has(discordId))
    .map(([, lid]) => lid.name);

  revalidatePath('/');
  revalidatePath('/leden');

  return NextResponse.json({
    metFamilierol: metFamilierol.length,
    toegevoegd,
    rangAangepast,
    ongewijzigd,
    zonderRangrol,
    zonderFamilierol,
    mislukt,
  });
}
