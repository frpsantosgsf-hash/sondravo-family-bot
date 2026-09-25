import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { huidigeVrijdag, laatsteDatum, vrijdagVan, vrijdagenTot, weeknummer } from '@/lib/weken';
import type { PotData, PotEntry, PotMember, PotTotals, PotWeek, PotWeekStatus } from '@/types';
import type { PotExpenseRow, PotIncomeRow } from '@/types/database';

const STANDAARD_BIJDRAGE = 50_000;
const STANDAARD_EERSTE_VRIJDAG = '2026-09-04';

const LEEG: PotData = {
  weeklyAmount: STANDAARD_BIJDRAGE,
  openingBalance: 0,
  firstFriday: STANDAARD_EERSTE_VRIJDAG,
  currentFriday: STANDAARD_EERSTE_VRIJDAG,
  weeks: [],
  members: [],
  expenses: [],
  income: [],
  totals: {
    opening: 0,
    contributions: 0,
    income: 0,
    expenses: 0,
    outstanding: 0,
    balance: 0,
  },
  meId: null,
  isAdmin: false,
  error: null,
};

function naarEntry(row: PotExpenseRow | PotIncomeRow): PotEntry {
  const isUitgave = 'spent_on' in row;
  return {
    id: row.id,
    date: isUitgave ? row.spent_on : row.received_on,
    description: row.description,
    who: isUitgave ? row.paid_by : row.source,
    amount: Number(row.amount),
    note: row.note,
    createdBy: row.created_by,
  };
}

/**
 * Alles wat de gangpot-pagina nodig heeft, in één keer.
 *
 * Het saldo wordt hier uitgerekend en nergens opgeslagen. De som is altijd
 * dezelfde: beginsaldo + betaalde bijdragen + overige inkomsten − uitgaven.
 * Openstaande bijdragen zitten er bewust níét in — dat geld is er nog niet.
 */
export const getGangpotData = cache(async (): Promise<PotData> => {
  if (!isSupabaseConfigured) {
    return { ...LEEG, error: 'Supabase is niet geconfigureerd.' };
  }

  const supabase = await createClient();

  const [
    { data: adminFlag },
    { data: meRow },
    instellingen,
    ledenResultaat,
    bijdragenResultaat,
    uitgavenResultaat,
    inkomstenResultaat,
  ] = await Promise.all([
    supabase.rpc('is_admin', {}),
    supabase.rpc('current_member_id', {}),
    supabase.from('pot_settings').select('*').eq('id', 1).maybeSingle(),
    supabase
      .from('members')
      .select('id, name, rank, avatar_url, joined_at')
      .order('name', { ascending: true }),
    supabase.from('pot_contributions').select('member_id, week_friday, amount'),
    supabase.from('pot_expenses').select('*').order('spent_on', { ascending: false }),
    supabase.from('pot_income').select('*').order('received_on', { ascending: false }),
  ]);

  const isAdmin = adminFlag === true;
  const meId = typeof meRow === 'string' ? meRow : null;

  /*
   * Een ontbrekende tabel is iets anders dan een lege pot. Zonder dit
   * onderscheid leest het scherm "nog geen uitgaven" terwijl de migratie
   * simpelweg nog niet gedraaid is, en gaat iedereen naar de verkeerde
   * oorzaak zoeken.
   */
  const storing = [
    ledenResultaat.error,
    bijdragenResultaat.error,
    uitgavenResultaat.error,
    inkomstenResultaat.error,
  ].find((fout) => fout && !isRechtenFout(fout));

  if (storing) {
    return {
      ...LEEG,
      isAdmin,
      meId,
      error: 'Kon de gangpot niet laden. Controleer of migratie 0016 is uitgevoerd.',
    };
  }

  const weeklyAmount = Number(instellingen.data?.weekly_amount ?? STANDAARD_BIJDRAGE);
  const openingBalance = Number(instellingen.data?.opening_balance ?? 0);
  const firstFriday = vrijdagVan(instellingen.data?.first_friday ?? STANDAARD_EERSTE_VRIJDAG);
  const currentFriday = huidigeVrijdag();

  const weekDatums = vrijdagenTot(firstFriday, currentFriday);

  // Betaald of niet is een ja/nee-vraag, dus een set is genoeg.
  const betaald = new Set<string>();
  let contributions = 0;

  for (const rij of bijdragenResultaat.data ?? []) {
    contributions += Number(rij.amount);
    if (rij.member_id) betaald.add(`${rij.member_id}|${rij.week_friday}`);
  }

  const leden: PotMember[] = (ledenResultaat.data ?? []).map((lid) => {
    /*
     * Iemand die vorige maand binnenkwam hoort niet met terugwerkende kracht
     * een achterstand te krijgen over weken dat hij er nog niet was. Zijn
     * eerste week is de week waarin hij lid werd, maar nooit vóór de eerste
     * week van de pot.
     *
     * Staat er geen datum, dan telt hij vanaf de eerste week van de pot. Dat
     * klopt voor de leden die er vanaf het begin bij waren; nieuwe leden
     * krijgen hun datum van de rollen-sync mee.
     */
    const sinds = eersteWeekVan(lid.joined_at, firstFriday);

    const weeks: Record<string, PotWeekStatus> = {};
    let openWeeks = 0;

    for (const vrijdag of weekDatums) {
      if (vrijdag < sinds) {
        weeks[vrijdag] = 'nvt';
        continue;
      }
      if (betaald.has(`${lid.id}|${vrijdag}`)) {
        weeks[vrijdag] = 'betaald';
        continue;
      }
      weeks[vrijdag] = 'open';
      openWeeks += 1;
    }

    return {
      id: lid.id,
      name: lid.name,
      rank: lid.rank,
      avatarUrl: lid.avatar_url,
      since: sinds,
      weeks,
      openWeeks,
      openAmount: openWeeks * weeklyAmount,
    };
  });

  const weeks: PotWeek[] = weekDatums.map((vrijdag) => {
    let paid = 0;
    let due = 0;

    for (const lid of leden) {
      const stand = lid.weeks[vrijdag];
      if (stand === 'nvt') continue;
      due += 1;
      if (stand === 'betaald') paid += 1;
    }

    return {
      friday: vrijdag,
      weekNumber: weeknummer(vrijdag),
      paid,
      due,
      received: paid * weeklyAmount,
    };
  });

  const expenses = (uitgavenResultaat.data ?? []).map(naarEntry);
  const income = (inkomstenResultaat.data ?? []).map(naarEntry);

  const totaalUitgaven = expenses.reduce((som, rij) => som + rij.amount, 0);
  const totaalInkomsten = income.reduce((som, rij) => som + rij.amount, 0);
  const outstanding = leden.reduce((som, lid) => som + lid.openAmount, 0);

  const totals: PotTotals = {
    opening: openingBalance,
    contributions,
    income: totaalInkomsten,
    expenses: totaalUitgaven,
    outstanding,
    balance: openingBalance + contributions + totaalInkomsten - totaalUitgaven,
  };

  return {
    weeklyAmount,
    openingBalance,
    firstFriday,
    currentFriday,
    weeks,
    members: leden,
    expenses,
    income,
    totals,
    meId,
    isAdmin,
    error: null,
  };
});

/** De eerste betaalvrijdag van een lid, nooit vóór die van de pot zelf. */
function eersteWeekVan(datum: string | null, eersteVrijdag: string): string {
  if (!datum || datum.length < 10) return eersteVrijdag;
  return laatsteDatum(eersteVrijdag, vrijdagVan(datum.slice(0, 10)));
}

/** Weigert de database dit alleen omdat de bezoeker er niet bij mag? */
function isRechtenFout(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === '42501' || error.code === 'PGRST301') return true;
  return /permission denied|row-level security/i.test(error.message ?? '');
}
