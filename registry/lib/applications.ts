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

/** Stuurt één bericht naar de webhook. Faalt nooit hardop. */
async function stuurNaarDiscord(embed: Record<string, unknown>): Promise<void> {
  const webhookUrl = getApplicationWebhookUrl();
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
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
  } catch {
    // Stilte is hier het juiste gedrag: de sollicitatie staat al opgeslagen.
  }
}

/**
 * Meldt een nieuwe sollicitatie in Discord.
 *
 * Mag nooit de inzending laten mislukken: als de webhook eruit ligt, staat de
 * sollicitatie nog steeds netjes op de site.
 */
export async function notifyDiscord(input: ApplicationInput, access: ViewerAccess): Promise<void> {
  const stijl = STATUS_STIJL['nieuw']!;

  // De korte gegevens naast elkaar, de verhalen eronder. Discord zet drie
  // inline-velden op één regel, dus dit blijft ook op een telefoon leesbaar.
  const velden: { name: string; value: string; inline?: boolean }[] = [
    { name: 'Leeftijd', value: input.age ? String(input.age) : '—', inline: true },
    { name: 'Ingame telefoon', value: input.phone || '—', inline: true },
    {
      name: 'Discord',
      value: access.discord.userId ? `<@${access.discord.userId}>` : '—',
      inline: true,
    },
    { name: '\u200b', value: `**Waarom Sondravo**\n${knip(input.motivation, 900)}` },
  ];

  if (input.experience) {
    velden.push({ name: '\u200b', value: `**Ervaring in FiveM**\n${knip(input.experience, 900)}` });
  }
  if (input.availability) {
    velden.push({
      name: '\u200b',
      value: `**Wanneer online**\n${knip(input.availability, 900)}`,
    });
  }

  await stuurNaarDiscord({
    author: {
      name: input.name,
      icon_url: access.discord.avatarUrl ?? undefined,
    },
    title: stijl.kop,
    url: `${getSiteUrl()}/sollicitaties`,
    description: 'Leden kunnen stemmen op de site. De Lead beslist.',
    color: stijl.kleur,
    timestamp: new Date().toISOString(),
    thumbnail: access.discord.avatarUrl ? { url: access.discord.avatarUrl } : undefined,
    fields: velden,
    footer: { text: 'sondravo-family.nl  ·  Stemmen kan bij Sollicitaties' },
  });
}

/**
 * Meldt in Discord dat een sollicitatie is afgehandeld.
 *
 * Kort en met de kleur van de uitkomst, zodat het kanaal in één blik laat
 * zien wat er met iemand gebeurd is zonder dat je de site hoeft te openen.
 */
export async function notifyDiscordStatus(
  row: Pick<ApplicationRow, 'name' | 'status' | 'discord_user_id' | 'avatar_url' | 'handled_by'>,
  stemmen?: { ja: number; nee: number },
): Promise<void> {
  const stijl = STATUS_STIJL[row.status];
  if (!stijl) return;

  const velden: { name: string; value: string; inline?: boolean }[] = [
    {
      name: 'Discord',
      value: row.discord_user_id ? `<@${row.discord_user_id}>` : '—',
      inline: true,
    },
    { name: 'Besloten door', value: row.handled_by || '—', inline: true },
  ];

  if (stemmen) {
    velden.push({ name: 'Stemmen', value: `✅ ${stemmen.ja}   ❌ ${stemmen.nee}`, inline: true });
  }

  await stuurNaarDiscord({
    author: { name: row.name, icon_url: row.avatar_url ?? undefined },
    title: stijl.kop,
    color: stijl.kleur,
    timestamp: new Date().toISOString(),
    fields: velden,
    footer: { text: 'sondravo-family.nl' },
  });
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

function knip(waarde: string, max: number): string {
  return waarde.length <= max ? waarde : `${waarde.slice(0, max - 1)}…`;
}

export type { ApplicationRow };
