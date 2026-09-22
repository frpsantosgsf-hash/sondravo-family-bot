import 'server-only';

import { getAdminRoleIds, getDiscordSyncConfig } from '@/lib/env';

const DISCORD_API = 'https://discord.com/api/v10';

export interface DiscordProfile {
  /** Staat dit account nog in de Sondravo-server? */
  inGuild: boolean;
  /** Servernaam (nickname) of globale weergavenaam. */
  displayName: string | null;
  /** De @handle. */
  username: string | null;
  avatarUrl: string | null;
  /** De rol-ID's die dit account in de server draagt. */
  roleIds: string[];
}

interface DiscordUserPayload {
  id: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
  discriminator?: string;
}

interface DiscordMemberPayload {
  nick?: string | null;
  avatar?: string | null;
  roles?: string[];
  user?: DiscordUserPayload;
}

function buildAvatarUrl(payload: DiscordMemberPayload, guildId: string): string | null {
  const user = payload.user;
  if (!user) return null;

  // Een server-specifieke avatar wint van de globale avatar.
  if (payload.avatar) {
    const ext = payload.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/guilds/${guildId}/users/${user.id}/avatars/${payload.avatar}.${ext}?size=256`;
  }

  if (user.avatar) {
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
  }

  return null;
}

/**
 * Haalt een lid op uit de Discord-server.
 *
 * Draait uitsluitend server-side: het bot-token mag nooit in de browser komen.
 * Is de sync niet geconfigureerd, dan geeft deze functie `null` terug en blijft
 * de site gewoon werken met de opgeslagen naam en avatar.
 */
export async function fetchDiscordProfile(discordUserId: string): Promise<DiscordProfile | null> {
  const config = getDiscordSyncConfig();
  if (!config) return null;
  if (!/^[0-9]{5,32}$/.test(discordUserId)) return null;

  const response = await fetch(
    `${DISCORD_API}/guilds/${config.guildId}/members/${discordUserId}`,
    {
      headers: { Authorization: `Bot ${config.botToken}` },
      cache: 'no-store',
    },
  );

  if (response.status === 404) {
    return { inGuild: false, displayName: null, username: null, avatarUrl: null, roleIds: [] };
  }

  if (!response.ok) {
    // Bewust geen response-body loggen: die kan tokens of rate-limit details bevatten.
    throw new Error(`Discord API gaf status ${response.status}`);
  }

  const payload = (await response.json()) as DiscordMemberPayload;

  return {
    inGuild: true,
    displayName: payload.nick ?? payload.user?.global_name ?? payload.user?.username ?? null,
    username: payload.user?.username ?? null,
    avatarUrl: buildAvatarUrl(payload, config.guildId),
    roleIds: payload.roles ?? [],
  };
}

export function isDiscordSyncEnabled(): boolean {
  return getDiscordSyncConfig() !== null;
}

/** Kan de site op basis van een Discord-rol beheerrechten uitdelen? */
export function isRoleSyncEnabled(): boolean {
  return getDiscordSyncConfig() !== null && getAdminRoleIds().length > 0;
}

export type RoleCheck =
  | { status: 'admin' }
  | { status: 'not-admin' }
  | { status: 'unknown' };

/**
 * Heeft dit Discord-account een van de rollen die beheerrechten geven?
 *
 * Geeft bewust `unknown` terug wanneer we het niet zeker weten — sync uit,
 * Discord onbereikbaar, rate limit. De aanroeper laat de rechten dan staan
 * zoals ze zijn. Een storing bij Discord mag nooit iemand zijn rechten
 * afnemen, en mag er ook nooit iemand rechten door krijgen.
 */
export async function checkAdminRole(discordUserId: string): Promise<RoleCheck> {
  const config = getDiscordSyncConfig();
  const adminRoleIds = getAdminRoleIds();

  if (!config || adminRoleIds.length === 0) return { status: 'unknown' };
  if (!/^[0-9]{5,32}$/.test(discordUserId)) return { status: 'unknown' };

  let response: Response;
  try {
    response = await fetch(`${DISCORD_API}/guilds/${config.guildId}/members/${discordUserId}`, {
      headers: { Authorization: `Bot ${config.botToken}` },
      cache: 'no-store',
    });
  } catch {
    return { status: 'unknown' };
  }

  // Niet (meer) in de server: dan ook geen beheerrechten.
  if (response.status === 404) return { status: 'not-admin' };
  if (!response.ok) return { status: 'unknown' };

  let payload: DiscordMemberPayload;
  try {
    payload = (await response.json()) as DiscordMemberPayload;
  } catch {
    return { status: 'unknown' };
  }

  const roles = payload.roles ?? [];
  return roles.some((role) => adminRoleIds.includes(role))
    ? { status: 'admin' }
    : { status: 'not-admin' };
}

/* -------------------------------------------------------------------------- */
/* Hele ledenlijst koppelen                                                    */
/* -------------------------------------------------------------------------- */

export interface GuildMember {
  discordUserId: string;
  /** Servernaam (nickname), anders de globale naam, anders de handle. */
  displayName: string;
  username: string;
  avatarUrl: string | null;
  /** De rol-ID's die dit lid in de server draagt. */
  roleIds: string[];
}

/**
 * Haalt iedereen op die in de Discord-server zit.
 *
 * Discord geeft maximaal duizend leden per verzoek, dus we bladeren door tot
 * de server op is. Voor een familie van deze omvang is dat één ronde.
 */
export async function fetchGuildMembers(): Promise<GuildMember[] | null> {
  const config = getDiscordSyncConfig();
  if (!config) return null;

  const leden: GuildMember[] = [];
  let na = '0';

  for (let ronde = 0; ronde < 10; ronde += 1) {
    const url = `${DISCORD_API}/guilds/${config.guildId}/members?limit=1000&after=${na}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bot ${config.botToken}` },
        cache: 'no-store',
      });
    } catch {
      return null;
    }

    if (!response.ok) return null;

    const batch = (await response.json()) as DiscordMemberPayload[];
    if (batch.length === 0) break;

    for (const payload of batch) {
      const user = payload.user;
      if (!user?.id || !user.username) continue;

      leden.push({
        discordUserId: user.id,
        displayName: payload.nick ?? user.global_name ?? user.username,
        username: user.username,
        avatarUrl: buildAvatarUrl(payload, config.guildId),
        roleIds: payload.roles ?? [],
      });
    }

    const laatste = batch[batch.length - 1]?.user?.id;
    if (!laatste || batch.length < 1000) break;
    na = laatste;
  }

  return leden;
}

/**
 * Haalt de rollen van de server op als id -> naam.
 *
 * Nodig om te zien wélke rang iemand draagt: de rol-ID's op een lid zeggen
 * niets, pas met de namen erbij weten we dat 1234… de rol "Zoky" is.
 */
export async function fetchGuildRoles(): Promise<Map<string, string> | null> {
  const config = getDiscordSyncConfig();
  if (!config) return null;

  let response: Response;
  try {
    response = await fetch(`${DISCORD_API}/guilds/${config.guildId}/roles`, {
      headers: { Authorization: `Bot ${config.botToken}` },
      cache: 'no-store',
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const payload = (await response.json()) as { id?: string; name?: string }[];
  const rollen = new Map<string, string>();
  for (const rol of payload) {
    if (rol.id && rol.name) rollen.set(rol.id, rol.name);
  }
  return rollen;
}

/**
 * Maakt een naam vergelijkbaar: kleine letters, zonder het SDF-voorvoegsel,
 * zonder emoji's, leestekens of accenten. "SDF | Lahaye" en "lahaye" worden
 * zo allebei "lahaye".
 */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^sdf\s*[|·•-]\s*/, '')
    .replace(/[^a-z0-9]/g, '');
}
