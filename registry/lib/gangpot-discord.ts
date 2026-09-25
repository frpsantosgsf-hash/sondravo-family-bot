import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  getDiscordSyncConfig,
  getGangpotChannelId,
  getGangpotWebhookUrl,
  getSiteUrl,
  hasServiceRoleKey,
  isSupabaseConfigured,
} from '@/lib/env';
import { plainName } from '@/lib/format';
import {
  dagenTot,
  datumZonderJaar,
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
    // Zonder het SDF-voorvoegsel: dat draagt niet iedereen in het register, en
    // een opsomming waarin de helft het wel heeft leest slordig.
    (betaaldDezeWeek.has(lid.id) ? betaald : open).push(plainName(lid.name));
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

/**
 * Een balk van twintig blokjes.
 *
 * Een getal moet je lezen en vergelijken; een balk zie je. In een kanaal waar
 * mensen langs scrollen is dat het verschil tussen wel en niet opvallen.
 */
function balk(deel: number, geheel: number): string {
  const vol = geheel === 0 ? 0 : Math.round((deel / geheel) * 20);
  return '█'.repeat(vol) + '░'.repeat(20 - vol);
}

function bouwEmbed(stand: Weekstand): Record<string, unknown> {
  const totaal = stand.betaald.length + stand.open.length;
  const alles = stand.open.length === 0 && totaal > 0;
  const deadline = deadlineVan(stand.vrijdag);
  const dagen = dagenTot(deadline);

  const velden: Record<string, unknown>[] = [];

  /*
   * Wie nog moet betalen staat bovenaan, niet onderaan. Dit bericht is er om
   * die mensen aan te zetten; wie al betaald heeft leest toch alleen of hij er
   * niet meer bij staat.
   */
  if (!alles) {
    velden.push({
      name: `⭕  Nog open — ${stand.open.length} · ${geld(stand.open.length * stand.bijdrage)}`,
      value: lijst(stand.open),
    });
  }

  velden.push({
    name: `✅  Betaald — ${stand.betaald.length}`,
    value: lijst(stand.betaald),
  });

  velden.push(
    { name: '🏦  In de pot', value: geld(stand.saldo), inline: true },
    {
      name: '📥  Deze week binnen',
      value: geld(stand.betaald.length * stand.bijdrage),
      inline: true,
    },
  );

  return {
    title: `💰  Gangpot — week ${weeknummer(stand.vrijdag)}`,
    // De titel wordt een link, zodat je vanuit Discord meteen op de juiste
    // pagina staat in plaats van hem te moeten opzoeken.
    url: `${getSiteUrl()}/gangpot`,
    description: [
      `Vrijdag ${datumZonderJaar(stand.vrijdag)} t/m vrijdag ${volledigeDatum(deadline)}`,
      `**${geld(stand.bijdrage)}** per lid`,
      '',
      `\`${balk(stand.betaald.length, totaal)}\`  **${stand.betaald.length} / ${totaal}**`,
      '',
      alles
        ? '🎉  **Iedereen heeft betaald.** Mooi werk.'
        : dagen > 0
          ? `Nog **${dagen}** ${dagen === 1 ? 'dag' : 'dagen'} om in te leggen.`
          : 'Vandaag is de laatste dag om in te leggen.',
    ].join('\n'),
    // Groen zodra de week rond is, anders oranje: dezelfde taal als de site.
    color: alles ? 0x2fa36b : 0xe0871f,
    fields: velden,
    footer: { text: 'The Sondravo Family · dit bericht werkt zichzelf bij' },
    timestamp: new Date().toISOString(),
  };
}

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * Waar het bericht naartoe gaat.
 *
 * Twee wegen, want ze hebben allebei hun plek. Een kanaal-ID is het minste
 * werk — de bot heeft zijn token toch al voor de rollen-sync — en het bericht
 * komt dan van de bot zelf. Een webhook blijft mogelijk voor wie de bot niet
 * in dat kanaal wil hebben.
 */
interface Kanaal {
  plaats(embed: Record<string, unknown>): Promise<string | null>;
  bewerk(messageId: string, embed: Record<string, unknown>): Promise<'ok' | 'weg' | 'mislukt'>;
}

function botKanaal(channelId: string, botToken: string): Kanaal {
  const headers = {
    authorization: `Bot ${botToken}`,
    'content-type': 'application/json',
  };
  const lichaam = (embed: Record<string, unknown>) =>
    JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } });

  return {
    async plaats(embed) {
      const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
        method: 'POST',
        headers,
        body: lichaam(embed),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { id?: string };
      return typeof payload.id === 'string' ? payload.id : null;
    },
    async bewerk(messageId, embed) {
      const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
        method: 'PATCH',
        headers,
        body: lichaam(embed),
      });
      if (response.ok) return 'ok';
      return response.status === 404 ? 'weg' : 'mislukt';
    },
  };
}

function webhookKanaal(webhookUrl: string): Kanaal {
  const headers = { 'content-type': 'application/json' };

  return {
    async plaats(embed) {
      // ?wait=true, anders geeft Discord alleen een lege bevestiging terug en
      // weten we het bericht-ID niet om het later bij te werken.
      const response = await fetch(`${webhookUrl}?wait=true`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          username: 'Sondravo Gangpot',
          embeds: [embed],
          allowed_mentions: { parse: [] },
        }),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { id?: string };
      return typeof payload.id === 'string' ? payload.id : null;
    },
    async bewerk(messageId, embed) {
      const response = await fetch(`${webhookUrl}/messages/${messageId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
      });
      if (response.ok) return 'ok';
      return response.status === 404 ? 'weg' : 'mislukt';
    },
  };
}

function kiesKanaal(): Kanaal | null {
  const channelId = getGangpotChannelId();
  const sync = getDiscordSyncConfig();
  if (channelId && sync) return botKanaal(channelId, sync.botToken);

  const webhookUrl = getGangpotWebhookUrl();
  if (webhookUrl) return webhookKanaal(webhookUrl);

  return null;
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
  const kanaal = kiesKanaal();
  // Zonder kanaal of zonder service role-sleutel is er niets te doen, en dat
  // is geen fout: de gangpot werkt op de site prima zonder Discord.
  if (!kanaal || !hasServiceRoleKey) return 'overgeslagen';

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
    let uitkomst: 'ok' | 'weg' | 'mislukt';
    try {
      uitkomst = await kanaal.bewerk(bestaand.message_id, embed);
    } catch {
      return 'overgeslagen';
    }

    if (uitkomst === 'ok') {
      await supabase
        .from('pot_week_messages')
        .update({ updated_at: new Date().toISOString() })
        .eq('week_friday', vrijdag);
      return 'bijgewerkt';
    }

    if (uitkomst === 'mislukt') return 'overgeslagen';

    /*
     * Het bericht is handmatig weggehaald. De verwijzing opruimen, zodat de
     * volgende ronde een nieuw bericht mag plaatsen in plaats van eeuwig
     * tegen een 404 aan te blijven lopen.
     */
    await supabase.from('pot_week_messages').delete().eq('week_friday', vrijdag);
  }

  if (!maakAan) return 'overgeslagen';

  let messageId: string | null;
  try {
    messageId = await kanaal.plaats(embed);
  } catch {
    return 'overgeslagen';
  }

  if (!messageId) return 'overgeslagen';

  await supabase
    .from('pot_week_messages')
    .upsert({ week_friday: vrijdag, message_id: messageId }, { onConflict: 'week_friday' });

  return 'geplaatst';
}
