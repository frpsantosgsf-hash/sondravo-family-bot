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
    return { inGuild: false, displayName: null, username: null, avatarUrl: null };
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
