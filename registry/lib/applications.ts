import 'server-only';

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
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
    return { ok: false, error: 'Opslaan is niet gelukt. Probeer het later opnieuw.' };
  }

  return { ok: true, id: String(data) };
}

/**
 * Meldt een nieuwe sollicitatie in Discord.
 *
 * Mag nooit de inzending laten mislukken: als de webhook eruit ligt, staat de
 * sollicitatie nog steeds netjes op de site.
 */
export async function notifyDiscord(input: ApplicationInput, access: ViewerAccess): Promise<void> {
  const webhookUrl = getApplicationWebhookUrl();
  if (!webhookUrl) return;

  const velden: { name: string; value: string; inline?: boolean }[] = [
    { name: 'Naam', value: input.name, inline: true },
  ];

  if (input.age) velden.push({ name: 'Leeftijd', value: String(input.age), inline: true });
  if (input.phone) velden.push({ name: 'Ingame telefoon', value: input.phone, inline: true });
  if (access.discord.username) {
    velden.push({ name: 'Discord', value: `<@${access.discord.userId}>`, inline: true });
  }
  velden.push({ name: 'Waarom Sondravo', value: knip(input.motivation, 1024) });
  if (input.experience) velden.push({ name: 'Ervaring', value: knip(input.experience, 1024) });
  if (input.availability) {
    velden.push({ name: 'Beschikbaarheid', value: knip(input.availability, 1024) });
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'Sondravo Registry',
        embeds: [
          {
            title: 'Nieuwe sollicitatie',
            url: `${getSiteUrl()}/leden`,
            color: 0xd71920,
            timestamp: new Date().toISOString(),
            thumbnail: access.discord.avatarUrl ? { url: access.discord.avatarUrl } : undefined,
            fields: velden,
            footer: { text: 'Afhandelen kan bij Instellingen > Sollicitaties' },
          },
        ],
        // Geen enkele ping vanuit een webhook: de <@id> hierboven blijft een
        // nette naam, maar haalt niemand uit zijn slaap.
        allowed_mentions: { parse: [] },
      }),
    });
  } catch {
    // Stilte is hier het juiste gedrag: de sollicitatie is al opgeslagen.
  }
}

function knip(waarde: string, max: number): string {
  return waarde.length <= max ? waarde : `${waarde.slice(0, max - 1)}…`;
}

export type { ApplicationRow };
