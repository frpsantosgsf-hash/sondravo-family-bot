import 'server-only';

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getApplicationWebhookUrl, getSiteUrl } from '@/lib/env';
import type { ViewerAccess } from '@/lib/access';
import type { ApplicationRow } from '@/types/database';

/** Wat er uit het formulier mag komen. */
export const applicationSchema = z.object({
  name: z.string().trim().min(2, 'Vul je naam in.').max(64, 'Naam is te lang.'),
  age: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .refine((value) => value === null || (Number.isInteger(value) && value >= 10 && value <= 99), {
      message: 'Vul een leeftijd tussen 10 en 99 in.',
    }),
  phone: z.string().trim().max(32, 'Telefoonnummer is te lang.').optional(),
  motivation: z
    .string()
    .trim()
    .min(20, 'Vertel wat uitgebreider waarom je bij Sondravo wilt.')
    .max(2000, 'Dit is te lang. Houd het onder de 2000 tekens.'),
  experience: z.string().trim().max(1000, 'Dit is te lang.').optional(),
  availability: z.string().trim().max(500, 'Dit is te lang.').optional(),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

/**
 * Slaat een sollicitatie op.
 *
 * Gaat bewust via de service-role client en submit_application(): die functie
 * mag alleen de server aanroepen. Daardoor kan een ingelogde bezoeker niet
 * langs het formulier heen rechtstreeks een rij wegschrijven en zo de
 * rolcontrole overslaan.
 */
export async function saveApplication(
  input: ApplicationInput,
  access: ViewerAccess,
  authUserId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: 'De server is niet volledig geconfigureerd.' };
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('submit_application', {
    p_auth_user_id: authUserId,
    p_name: input.name,
    p_motivation: input.motivation,
    p_discord_user_id: access.discord.userId,
    p_discord_username: access.discord.username,
    p_discord_display_name: access.discord.displayName,
    p_avatar_url: access.discord.avatarUrl,
    p_age: input.age,
    p_phone: input.phone ?? null,
    p_experience: input.experience ?? null,
    p_availability: input.availability ?? null,
  });

  if (error) {
    // 23505 = unique violation: er staat al een openstaande sollicitatie.
    if (error.code === '23505') {
      return {
        ok: false,
        error: 'Je hebt al een sollicitatie openstaan. Wacht even tot een Lead ernaar kijkt.',
      };
    }

    // 42501 en 42883 wijzen op de installatie, niet op de bezoeker: de
    // functie ontbreekt of de server draait niet als service_role. Dat is
    // iets voor een Lead om recht te zetten, dus zeg dat er dan ook bij in
    // plaats van "probeer het later opnieuw" — later werkt het namelijk ook
    // niet.
    if (error.code === '42501' || error.code === '42883') {
      return {
        ok: false,
        error:
          'De sollicitatie kon niet worden opgeslagen door een serverinstelling. Laat een Lead dit nakijken.',
      };
    }

    return { ok: false, error: 'Opslaan is niet gelukt. Probeer het later opnieuw.' };
  }

  return { ok: true, id: String(data) };
}

/**
 * Kleur en kop per status. Dezelfde kleuren als op de site, zodat een
 * sollicitatie er in Discord net zo uitziet als in het overzicht: oranje
 * vraagt om aandacht, groen en rood zijn afgehandeld.
 */
const STATUS_STIJL: Record<string, { kleur: number; kop: string }> = {
  nieuw: { kleur: 0xe0871f, kop: '📨  Nieuwe sollicitatie' },
  in_behandeling: { kleur: 0xc9b98a, kop: '👀  Sollicitatie in behandeling' },
  aangenomen: { kleur: 0x2fa36b, kop: '✅  Sollicitatie aangenomen' },
  afgewezen: { kleur: 0xd71920, kop: '❌  Sollicitatie afgewezen' },
};

/**
 * Stuurt één bericht naar de webhook en geeft het bericht-ID terug.
 *
 * Dat ID hebben we nodig om het bericht later weer op te kunnen ruimen. Met
 * ?wait=true wacht Discord tot het bericht bestaat en geeft hij het terug;
 * zonder die parameter krijg je alleen een lege bevestiging.
 *
 * Faalt nooit hardop: een kapotte webhook mag geen sollicitatie tegenhouden.
 */
async function stuurNaarDiscord(embed: Record<string, unknown>): Promise<string | null> {
  const webhookUrl = getApplicationWebhookUrl();
  if (!webhookUrl) return null;

  try {
    const response = await fetch(`${webhookUrl}?wait=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'Sondravo Registry',
        embeds: [embed],
        // Geen enkele ping vanuit een webhook: een <@id> blijft een nette
        // naam, maar haalt niemand uit zijn slaap.
        allowed_mentions: { parse: [] },
      }),
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as { id?: string };
    return typeof payload.id === 'string' ? payload.id : null;
  } catch {
    // Stilte is hier het juiste gedrag: de sollicitatie staat al opgeslagen.
    return null;
  }
}

/**
 * Haalt een eerder geplaatst bericht weg uit het kanaal.
 *
 * Een webhook mag zijn eigen berichten verwijderen, dus hier is geen bot-token
 * voor nodig. Bestaat het bericht niet meer, dan is dat ook goed.
 */
export async function verwijderDiscordBericht(messageId: string | null): Promise<void> {
  const webhookUrl = getApplicationWebhookUrl();
  if (!webhookUrl || !messageId) return;

  try {
    await fetch(`${webhookUrl}/messages/${messageId}`, { method: 'DELETE' });
  } catch {
    // Het bericht is dan al weg, of Discord ligt eruit. Geen van beide mag
    // het archiveren tegenhouden.
  }
}

/**
 * Bewerkt een eerder geplaatst bericht.
 *
 * Zo groeit één bericht mee met de sollicitatie in plaats van dat er bij elke
 * stem en elk besluit een nieuwe melding onder komt. Het kanaal blijft dan
 * leesbaar, en de stand staat altijd op één plek.
 */
async function bewerkDiscordBericht(
  messageId: string,
  embed: Record<string, unknown>,
): Promise<boolean> {
  const webhookUrl = getApplicationWebhookUrl();
  if (!webhookUrl) return false;

  try {
    const response = await fetch(`${webhookUrl}/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Kapt een tekst af zodat hij binnen de limiet van Discord past. */
function knip(waarde: string, max: number): string {
  return waarde.length <= max ? waarde : `${waarde.slice(0, max - 1)}…`;
}

/** De gegevens die het Discord-bericht nodig heeft. */
export interface DiscordSollicitatie {
  name: string;
  status: string;
  age: number | null;
  phone: string | null;
  motivation: string;
  experience: string | null;
  availability: string | null;
  discord_user_id: string | null;
  avatar_url: string | null;
  handled_by: string | null;
  voting_closed: boolean;
}

/**
 * Bouwt het hele bericht op uit de sollicitatie zoals hij nu in de database
 * staat. Eén functie voor zowel het eerste bericht als elke bewerking daarna,
 * zodat de twee nooit uit elkaar kunnen lopen.
 */
function bouwEmbed(
  row: DiscordSollicitatie,
  stemmen: { ja: number; nee: number },
): Record<string, unknown> {
  const stijl = STATUS_STIJL[row.status] ?? STATUS_STIJL['nieuw']!;

  const velden: { name: string; value: string; inline?: boolean }[] = [
    { name: 'Leeftijd', value: row.age ? String(row.age) : '—', inline: true },
    { name: 'Ingame telefoon', value: row.phone || '—', inline: true },
    {
      name: 'Discord',
      value: row.discord_user_id ? `<@${row.discord_user_id}>` : '—',
      inline: true,
    },
    { name: '\u200b', value: `**Waarom Sondravo**\n${knip(row.motivation, 900)}` },
  ];

  if (row.experience) {
    velden.push({ name: '\u200b', value: `**Ervaring in FiveM**\n${knip(row.experience, 900)}` });
  }
  if (row.availability) {
    velden.push({ name: '\u200b', value: `**Wanneer online**\n${knip(row.availability, 900)}` });
  }

  // De stand onderaan, waar hij meegroeit met elke stem.
  const totaal = stemmen.ja + stemmen.nee;
  const staat = row.voting_closed ? ' · gesloten' : '';
  velden.push({
    name: '\u200b',
    value:
      `**Stemmen**\n✅ ${stemmen.ja}   ❌ ${stemmen.nee}` +
      (totaal === 0 && !row.voting_closed
        ? '\n_Nog niemand heeft gestemd._'
        : `\n_${totaal} ${totaal === 1 ? 'stem' : 'stemmen'}${staat}._`),
  });

  if (row.handled_by) {
    velden.push({ name: 'Besloten door', value: row.handled_by, inline: true });
  }

  return {
    author: { name: row.name, icon_url: row.avatar_url ?? undefined },
    title: stijl.kop,
    url: `${getSiteUrl()}/sollicitaties`,
    color: stijl.kleur,
    timestamp: new Date().toISOString(),
    thumbnail: row.avatar_url ? { url: row.avatar_url } : undefined,
    fields: velden,
    footer: { text: 'sondravo-family.nl  ·  Stemmen kan bij Sollicitaties' },
  };
}

/**
 * Plaatst het eerste bericht van een sollicitatie en geeft het bericht-ID
 * terug. Mag nooit de inzending laten mislukken: ligt de webhook eruit, dan
 * staat de sollicitatie nog steeds netjes op de site.
 */
export async function notifyDiscord(row: DiscordSollicitatie): Promise<string | null> {
  return stuurNaarDiscord(bouwEmbed(row, { ja: 0, nee: 0 }));
}

/**
 * Werkt het bestaande bericht bij naar de huidige stand van zaken.
 *
 * Wordt aangeroepen na elke stem en na elk besluit. Loopt via de service-role
 * client omdat een stemmend lid de sollicitatie wel mag zien maar niet alle
 * velden, en omdat dit hoe dan ook server-werk is.
 */
export async function syncDiscordBericht(applicationId: string): Promise<void> {
  if (!getApplicationWebhookUrl() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    const supabase = createAdminClient();

    const { data: row } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .maybeSingle();

    if (!row?.discord_message_id) return;

    const { data: stemRijen } = await supabase
      .from('application_votes')
      .select('vote')
      .eq('application_id', applicationId);

    await bewerkDiscordBericht(
      row.discord_message_id,
      bouwEmbed(row, {
        ja: (stemRijen ?? []).filter((stem) => stem.vote === 'ja').length,
        nee: (stemRijen ?? []).filter((stem) => stem.vote === 'nee').length,
      }),
    );
  } catch {
    // Het bericht in Discord loopt dan achter. Vervelend, maar geen reden om
    // een stem of een besluit te laten mislukken.
  }
}

/**
 * De eigen sollicitatie van de ingelogde bezoeker, als die er is.
 *
 * Zo weet de pagina zélf dat er al iets is ingestuurd, ook als je hem morgen
 * opnieuw opent. Een melding die alleen op het scherm blijft staan tot je
 * ververst, is geen bevestiging maar een fopspeen.
 *
 * Row Level Security laat alleen je eigen rij door; ook zonder deze filter
 * zou je nooit die van een ander te zien krijgen.
 */
export async function getMyApplication(): Promise<ApplicationRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from('applications')
    .select('*')
    .eq('auth_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

export type { ApplicationRow };

/**
 * Bewaart het ID van een Discord-bericht bij de sollicitatie.
 *
 * Loopt via de service-role client: de browser heeft hier niets te zoeken, en
 * een mislukking mag nooit de inzending of het besluit tegenhouden.
 */
export async function onthoudDiscordBericht(
  applicationId: string,
  messageId: string | null,
  statusMessageId: string | null,
): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    await createAdminClient().rpc('set_application_discord_message', {
      p_id: applicationId,
      p_message_id: messageId,
      p_status_message_id: statusMessageId,
    });
  } catch {
    // Dan blijft het bericht straks in Discord staan. Vervelend, maar geen
    // reden om de actie te laten mislukken.
  }
}
