/**
 * Eén plek waar omgevingsvariabelen gelezen worden.
 *
 * Belangrijk: alleen NEXT_PUBLIC_* variabelen belanden in de browserbundel.
 * De service-role key en het bot-token worden hier bewust alleen via
 * functies aangeboden die op de server draaien.
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const SUPABASE_CONFIG_ERROR =
  'Supabase is nog niet geconfigureerd. Zet NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in je environment variables.';

/** Is de service role-sleutel beschikbaar? Voor code die stil moet kunnen overslaan. */
export const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Alleen server-side aanroepen. Gooit wanneer de key ontbreekt. */
export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY ontbreekt (alleen server-side beschikbaar).');
  }
  return key;
}

/** Optionele Discord-sync. Leeg = sync staat uit, de site werkt gewoon door. */
export function getDiscordSyncConfig(): { botToken: string; guildId: string } | null {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId) return null;
  return { botToken, guildId };
}

/**
 * Discord-rollen die automatisch beheerrechten geven op de site.
 * Meerdere rollen mogen, gescheiden door komma's. Leeg = uit.
 */
export function getAdminRoleIds(): string[] {
  return String(process.env.DISCORD_ADMIN_ROLE_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^[0-9]{5,32}$/.test(id));
}

/**
 * De Discord-rol die iedereen in de familie heeft. Wie die rol draagt hoort
 * op de ledenlijst; wie hem niet heeft, hoort er niet bij. Leeg = de
 * rol-import staat uit.
 */
export function getMemberRoleId(): string | null {
  const id = String(process.env.DISCORD_MEMBER_ROLE_ID ?? '').trim();
  return /^[0-9]{5,32}$/.test(id) ? id : null;
}

/**
 * De Discord-rol die toegang geeft tot het sollicitatieformulier. Wie die rol
 * niet draagt, krijgt het formulier niet te zien. Leeg = solliciteren staat uit.
 */
export function getApplicantRoleId(): string | null {
  const id = String(process.env.DISCORD_APPLICANT_ROLE_ID ?? '').trim();
  return /^[0-9]{5,32}$/.test(id) ? id : null;
}

/**
 * Discord-webhook waar een nieuwe sollicitatie gemeld wordt. Leeg = geen
 * melding in Discord; de sollicitatie komt dan alleen op de site binnen.
 */
export function getApplicationWebhookUrl(): string | null {
  const url = String(process.env.DISCORD_APPLICATION_WEBHOOK_URL ?? '').trim();
  return url.startsWith('https://discord.com/api/webhooks/') ||
    url.startsWith('https://discordapp.com/api/webhooks/')
    ? url
    : null;
}

/**
 * Het kanaal waar het wekelijkse gangpot-bericht in komt.
 *
 * Alleen het kanaal-ID; de bot post er zelf in met het token dat de
 * rollen-sync toch al gebruikt. Dat scheelt het aanmaken van een webhook, en
 * het bericht komt van de bot in plaats van van een naamloze haak.
 */
export function getGangpotChannelId(): string | null {
  const id = String(process.env.DISCORD_GANGPOT_CHANNEL_ID ?? '').trim();
  return /^[0-9]{5,32}$/.test(id) ? id : null;
}

/**
 * Discord-webhook voor de wekelijkse gangpot-melding. Een eigen webhook en
 * niet die van de sollicitaties: de kas hoort in het kanaal van de familie,
 * niet bij de aanmeldingen. Leeg = geen melding in Discord.
 */
export function getGangpotWebhookUrl(): string | null {
  const url = String(process.env.DISCORD_GANGPOT_WEBHOOK_URL ?? '').trim();
  return url.startsWith('https://discord.com/api/webhooks/') ||
    url.startsWith('https://discordapp.com/api/webhooks/')
    ? url
    : null;
}

/**
 * Basis-URL van de site, gebruikt voor OAuth-redirects en metadata.
 * Vercel zet VERCEL_PROJECT_PRODUCTION_URL automatisch.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}
