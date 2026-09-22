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
