import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminRoleIds, getDiscordSyncConfig, isSupabaseConfigured } from '@/lib/env';
import { discordIdFromMetadata } from '@/lib/admin-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * Zelftest voor de koppeling met Discord.
 *
 * Vertelt een ingelogde bezoeker waaróm hij wel of geen beheerrechten krijgt.
 * Toont nooit het bot-token of andere geheimen — alleen of ze gezet zijn, wat
 * Discord antwoordt, en welke rollen deze persoon zelf heeft.
 */
export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ stap: 'Supabase', probleem: 'Niet geconfigureerd.' }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { probleem: 'Je bent niet ingelogd. Log eerst in op de site en open deze pagina opnieuw.' },
      { status: 401 },
    );
  }

  const config = getDiscordSyncConfig();
  const adminRoleIds = getAdminRoleIds();
  const discordUserId = discordIdFromMetadata(user.user_metadata as Record<string, unknown>);
  const { data: isAdmin } = await supabase.rpc('is_admin', {});

  const rapport: Record<string, unknown> = {
    '1_ingelogd_als': user.email ?? user.id,
    '2_jouw_discord_id': discordUserId ?? 'NIET GEVONDEN',
    '3_beheerrechten_nu': isAdmin === true ? 'JA' : 'NEE',
    '4_instellingen': {
      DISCORD_BOT_TOKEN: config?.botToken ? 'gezet' : 'ONTBREEKT',
      DISCORD_GUILD_ID: config?.guildId ?? 'ONTBREEKT',
      DISCORD_ADMIN_ROLE_IDS: adminRoleIds.length > 0 ? adminRoleIds : 'ONTBREEKT of ongeldig',
    },
  };

  if (!config) {
    rapport['CONCLUSIE'] =
      'DISCORD_BOT_TOKEN en/of DISCORD_GUILD_ID ontbreken in Vercel. Zet ze en doe een Redeploy.';
    return NextResponse.json(rapport);
  }

  if (adminRoleIds.length === 0) {
    rapport['CONCLUSIE'] =
      'DISCORD_ADMIN_ROLE_IDS ontbreekt of is geen geldig rol-ID (alleen cijfers). Zet hem en doe een Redeploy.';
    return NextResponse.json(rapport);
  }

  if (!discordUserId) {
    rapport['CONCLUSIE'] = 'Je account heeft geen Discord-ID. Log uit en opnieuw in via Discord.';
    return NextResponse.json(rapport);
  }

  // --- Wat zegt Discord zelf? -----------------------------------------------
  let response: Response;
  try {
    response = await fetch(`${DISCORD_API}/guilds/${config.guildId}/members/${discordUserId}`, {
      headers: { Authorization: `Bot ${config.botToken}` },
      cache: 'no-store',
    });
  } catch {
    rapport['CONCLUSIE'] = 'Kon Discord niet bereiken.';
    return NextResponse.json(rapport);
  }

  rapport['5_antwoord_van_discord'] = `HTTP ${response.status}`;

  if (response.status === 401) {
    rapport['CONCLUSIE'] =
      'Discord weigert het bot-token (401). Het token is verlopen of hoort bij een andere app. Reset het in het Discord-portaal en zet het nieuwe token in Vercel.';
    return NextResponse.json(rapport);
  }

  if (response.status === 403) {
    rapport['CONCLUSIE'] =
      'Discord geeft geen toegang (403). Zet SERVER MEMBERS INTENT aan: Discord-portaal, je app, Bot, Privileged Gateway Intents.';
    return NextResponse.json(rapport);
  }

  if (response.status === 404) {
    rapport['CONCLUSIE'] =
      'Discord kent deze combinatie niet (404). Twee mogelijke oorzaken: je bot zit niet in deze server, of DISCORD_GUILD_ID is het verkeerde servernummer.';
    return NextResponse.json(rapport);
  }

  if (!response.ok) {
    rapport['CONCLUSIE'] = `Onverwacht antwoord van Discord (${response.status}).`;
    return NextResponse.json(rapport);
  }

  const payload = (await response.json()) as { roles?: string[]; nick?: string | null };
  const rollen = payload.roles ?? [];
  const treffer = rollen.filter((rol) => adminRoleIds.includes(rol));

  rapport['6_jouw_rollen_in_de_server'] = rollen;
  rapport['7_gezocht_rol_id'] = adminRoleIds;

  rapport['CONCLUSIE'] =
    treffer.length > 0
      ? 'ALLES GOED. Je hebt de juiste rol. Log uit en opnieuw in, dan krijg je beheerrechten.'
      : 'Je hebt de gezochte rol NIET. Vergelijk hierboven lijst 6 met lijst 7: staat het nummer uit 7 niet in 6, dan is DISCORD_ADMIN_ROLE_IDS het verkeerde rol-ID. Haal het juiste op: Serverinstellingen, Rollen, rechtsklik op de rol, Rol-ID kopiëren.';

  return NextResponse.json(rapport);
}
