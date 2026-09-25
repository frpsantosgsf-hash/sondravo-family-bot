import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getGangpotWebhookUrl, hasServiceRoleKey, isSupabaseConfigured } from '@/lib/env';
import {
  deadlineVan,
  geld,
  laatsteDatum,
  vrijdagNa,
  vrijdagVoor,
  volledigeDatum,
  weeknummer,
} from '@/lib/weken';

/**
 * De wekelijkse gangpot-melding in Discord.
 *
 * Eén bericht per week dat zichzelf bijwerkt zodra de Lead iemand afvinkt,
 * in plaats van een melding per betaling. Zo staat de stand altijd op één
 * plek en loopt het kanaal niet vol.
 *
 * Alles hier faalt stil. Een kapotte webhook mag nooit een afvink
 * tegenhouden: de administratie staat al veilig in de database.
 */

interface Weekstand {
  vrijdag: string;
  bijdrage: number;
  betaald: string[];
  open: string[];
  saldo: number;
}

async function haalWeekstand(vrijdag: string): Promise<Weekstand | null> {
  if (!isSupabaseConfigured || !hasServiceRoleKey) return null;

  const supabase = createAdminClient();

  const [instellingen, leden, bijdragen, uitgaven, inkomsten, weekRijen] = await Promise.all([
    supabase.from('pot_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('members').select('id, name, joined_at').order('name', { ascending: true }),
    supabase.from('pot_contributions').select('member_id, week_friday, amount'),
    supabase.from('pot_expenses').select('amount'),
    supabase.from('pot_income').select('amount'),
    supabase.from('pot_contributions').select('member_id').eq('week_friday', vrijdag),
  ]);

  if (leden.error || bijdragen.error) return null;

  const bijdrage = Number(instellingen.data?.weekly_amount ?? 50_000);
  const beginsaldo = Number(instellingen.data?.opening_balance ?? 0);
  const eersteVrijdag = vrijdagVoor(instellingen.data?.first_friday ?? vrijdag);

  const betaaldDezeWeek = new Set(
    (weekRijen.data ?? []).map((rij) => rij.member_id).filter((id): id is string => Boolean(id)),
  );

  const betaald: string[] = [];
  const open: string[] = [];

  for (const lid of leden.data ?? []) {
    // Wie later binnenkwam telt pas mee vanaf zijn eigen eerste week. Dezelfde
    // regel als op de site.
    const sinds =
      lid.joined_at && lid.joined_at.length >= 10
        ? laatsteDatum(eersteVrijdag, vrijdagNa(lid.joined_at.slice(0, 10)))
        : eersteVrijdag;

    if (vrijdag < sinds) continue;
    (betaaldDezeWeek.has(lid.id) ? betaald : open).push(lid.name);
  }

  const totaalBijdragen = (bijdragen.data ?? []).reduce((som, rij) => som + Number(rij.amount), 0);
  const totaalUitgaven = (uitgaven.data ?? []).reduce((som, rij) => som + Number(rij.amount), 0);
  const totaalInkomsten = (inkomsten.data ?? []).reduce((som, rij) => som + Number(rij.amount), 0);

  return {
    vrijdag,
    bijdrage,
    betaald,
    open,
    saldo: beginsaldo + totaalBijdragen + totaalInkomsten - totaalUitgaven,
  };
}

/** Kapt een lijst af zodat hij binnen de 1024 tekens van Discord past. */
function lijst(namen: string[]): string {
  if (namen.length === 0) return '—';

  const volledig = namen.join(' · ');
  if (volledig.length <= 1000) return volledig;

  let tekst = '';
  let getoond = 0;

  for (const naam of namen) {
    if (tekst.length + naam.length + 3 > 930) break;
    tekst += (tekst ? ' · ' : '') + naam;
    getoond += 1;
  }

  return `${tekst} … en nog ${namen.length - getoond}`;
}

function bouwEmbed(stand: Weekstand): Record<string, unknown> {
  const totaal = stand.betaald.length + stand.open.length;
  const alles = stand.open.length === 0 && totaal > 0;

  return {
    title: `💰  Gangpot — week ${weeknummer(stand.vrijdag)}`,
    description: [
      `Vrijdag ${volledigeDatum(stand.vrijdag)} · **${geld(stand.bijdrage)}** per lid`,
      alles
        ? '**Iedereen heeft betaald.** Mooi werk.'
        : `Nog **${stand.open.length}** van de **${totaal}** te gaan — betalen kan tot vrijdag ${volledigeDatum(
            deadlineVan(stand.vrijdag),
          )}.`,
    ].join('\n'),
    // Groen zodra de week rond is, anders oranje: dezelfde taal als de site.
    color: alles ? 0x2fa36b : 0xe0871f,
    fields: [
      {
        name: `✅  Betaald (${stand.betaald.length})`,
        value: lijst(stand.betaald),
      },
      {
        name: `⭕  Nog open (${stand.open.length})`,
        value: lijst(stand.open),
      },
      {
        name: '🏦  Saldo',
        value: geld(stand.saldo),
        inline: true,
      },
      {
        name: '📥  Deze week binnen',
        value: geld(stand.betaald.length * stand.bijdrage),
        inline: true,
      },
    ],
    footer: { text: 'The Sondravo Family · bijgewerkt' },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Plaatst of bewerkt het bericht van één week.
 *
 * `maakAan` staat alleen aan vanuit de wekelijkse taak. Vinkt de Lead
 * doordeweeks iemand af terwijl er nog geen bericht is, dan hoort daar niet
 * ineens een melding uit te rollen — dan wordt er simpelweg niets gedaan.
 */
export async function syncGangpotBericht(
  vrijdag: string,
  maakAan = false,
): Promise<'geplaatst' | 'bijgewerkt' | 'overgeslagen'> {
  const webhookUrl = getGangpotWebhookUrl();
  // Zonder webhook of zonder service role-sleutel is er niets te doen, en dat
  // is geen fout: de gangpot werkt op de site prima zonder Discord.
  if (!webhookUrl || !hasServiceRoleKey) return 'overgeslagen';

  const stand = await haalWeekstand(vrijdag);
  if (!stand) return 'overgeslagen';

  const supabase = createAdminClient();
  const embed = bouwEmbed(stand);

  const { data: bestaand } = await supabase
    .from('pot_week_messages')
    .select('message_id')
    .eq('week_friday', vrijdag)
    .maybeSingle();

  if (bestaand?.message_id) {
    try {
      const response = await fetch(`${webhookUrl}/messages/${bestaand.message_id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
      });

      if (response.ok) {
        await supabase
          .from('pot_week_messages')
          .update({ message_id: bestaand.message_id, updated_at: new Date().toISOString() })
          .eq('week_friday', vrijdag);
        return 'bijgewerkt';
      }

      /*
       * Het bericht is handmatig weggehaald. De verwijzing opruimen, zodat de
       * volgende ronde een nieuw bericht mag plaatsen in plaats van eeuwig
       * tegen een 404 aan te blijven lopen.
       */
      if (response.status === 404) {
        await supabase.from('pot_week_messages').delete().eq('week_friday', vrijdag);
      } else {
        return 'overgeslagen';
      }
    } catch {
      return 'overgeslagen';
    }
  }

  if (!maakAan) return 'overgeslagen';

  try {
    const response = await fetch(`${webhookUrl}?wait=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'Sondravo Gangpot',
        embeds: [embed],
        allowed_mentions: { parse: [] },
      }),
    });

    if (!response.ok) return 'overgeslagen';

    const payload = (await response.json()) as { id?: string };
    if (typeof payload.id !== 'string') return 'overgeslagen';

    await supabase
      .from('pot_week_messages')
      .upsert({ week_friday: vrijdag, message_id: payload.id }, { onConflict: 'week_friday' });

    return 'geplaatst';
  } catch {
    return 'overgeslagen';
  }
}
