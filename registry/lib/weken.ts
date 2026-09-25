/**
 * Weekrekenwerk voor de gangpot.
 *
 * Er wordt betaald op vrijdag, dus een week wordt hier aangeduid met zijn
 * vrijdag: '2026-09-04' is week 36. Alle rekenwerk gebeurt op datumtekst in
 * UTC, want een datum zonder tijd heeft geen tijdzone — en zodra je er een
 * lokale Date van maakt, springt hij in de zomer een dag terug.
 *
 * De enige plek waar de tijdzone er wél toe doet is de vraag "welke dag is
 * het nu", en die wordt daarom expliciet in Amsterdamse tijd gesteld.
 */

export const TIJDZONE = 'Europe/Amsterdam';

const DAG_MS = 86_400_000;

const AMSTERDAM = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIJDZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** De datum van vandaag in Nederland, als 'JJJJ-MM-DD'. */
export function vandaag(): string {
  // en-CA levert precies JJJJ-MM-DD, zonder aan de datumdelen te hoeven plukken.
  return AMSTERDAM.format(new Date());
}

function naarUtc(datum: string): Date {
  return new Date(`${datum}T00:00:00Z`);
}

function naarTekst(waarde: Date): string {
  return waarde.toISOString().slice(0, 10);
}

/** Herkent 'JJJJ-MM-DD' en controleert of het een bestaande dag is. */
export function isDatum(waarde: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(waarde)) return false;
  const datum = naarUtc(waarde);
  return !Number.isNaN(datum.getTime()) && naarTekst(datum) === waarde;
}

export function telDagenOp(datum: string, dagen: number): string {
  return naarTekst(new Date(naarUtc(datum).getTime() + dagen * DAG_MS));
}

/** Maandag = 1 ... zondag = 7. */
function isoDagnummer(datum: string): number {
  const dag = naarUtc(datum).getUTCDay();
  return dag === 0 ? 7 : dag;
}

/**
 * De laatste vrijdag op of vóór deze datum.
 *
 * Dit is de kern van de hele regeling: er wordt op vrijdag ingelegd en je hebt
 * tot de volgende vrijdag de tijd. Een betaalweek loopt dus van vrijdag tot
 * vrijdag, en wordt aangeduid met de vrijdag waarop hij begon.
 *
 * Bewust niet de vrijdag van de ISO-week (maandag t/m zondag). Die springt op
 * maandag al naar de vrijdag die nog moet komen, en dan zou de site vier
 * dagen per week een inleg opeisen waarvan de dag nog niet eens geweest is.
 */
export function vrijdagVoor(datum: string): string {
  return telDagenOp(datum, -((isoDagnummer(datum) - 5 + 7) % 7));
}

/**
 * De eerste vrijdag op of na deze datum.
 *
 * Voor de dag dat iemand lid wordt: wie op maandag binnenkomt heeft de
 * vrijdag daarvoor niet gemist, want toen was hij er nog niet. Zijn eerste
 * inleg is die van de vrijdag die komt.
 */
export function vrijdagNa(datum: string): string {
  return telDagenOp(datum, (5 - isoDagnummer(datum) + 7) % 7);
}

/**
 * De uiterste dag van een betaalweek: de vrijdag erna.
 *
 * Op die dag begint de volgende week, dus wie dan nog niet betaald heeft
 * loopt achter.
 */
export function deadlineVan(vrijdag: string): string {
  return telDagenOp(vrijdag, 7);
}

/** Hele dagen van de ene datum naar de andere. Negatief als hij al voorbij is. */
export function dagenTot(datum: string): number {
  return Math.round((naarUtc(datum).getTime() - naarUtc(vandaag()).getTime()) / DAG_MS);
}

/**
 * De laatste van twee datums.
 *
 * Werkt op de tekst en niet op Date: 'JJJJ-MM-DD' sorteert alfabetisch al in
 * de goede volgorde, en zo blijft er geen tijdzone in de vergelijking zitten.
 */
export function laatsteDatum(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * De vrijdag waarmee de lopende betaalweek begon, in Amsterdamse tijd.
 *
 * Op zaterdag is dat nog steeds gisteren: de week die vrijdag begon loopt
 * gewoon door tot de volgende vrijdag.
 */
export function huidigeVrijdag(): string {
  return vrijdagVoor(vandaag());
}

/** Het ISO-weeknummer, hetzelfde nummer dat de spreadsheet gebruikt. */
export function weeknummer(datum: string): number {
  // De donderdag bepaalt bij welk jaar een week hoort.
  const donderdag = naarUtc(telDagenOp(datum, 4 - isoDagnummer(datum)));
  const eersteJanuari = new Date(Date.UTC(donderdag.getUTCFullYear(), 0, 1));
  const dagen = Math.round((donderdag.getTime() - eersteJanuari.getTime()) / DAG_MS);
  return Math.floor(dagen / 7) + 1;
}

/**
 * Alle betaalvrijdagen van de eerste week tot en met de lopende week.
 *
 * Toekomstige weken zitten er niet bij: daar valt nog niets over te zeggen,
 * en ze zouden alleen maar als achterstand meetellen.
 */
export function vrijdagenTot(eersteVrijdag: string, laatsteVrijdag: string): string[] {
  const start = vrijdagVoor(eersteVrijdag);
  const reeks: string[] = [];

  for (let dag = start; dag <= laatsteVrijdag; dag = telDagenOp(dag, 7)) {
    reeks.push(dag);
    // Een noodrem voor het geval de instellingen ooit een absurde startdatum
    // krijgen: tien jaar aan weken is ruim genoeg, oneindig lussen is het niet.
    if (reeks.length > 520) break;
  }

  return reeks;
}

const DAG_MAAND = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** '4 sep' — kort genoeg voor een kolomkop op een telefoon. */
export function korteDatum(datum: string): string {
  return DAG_MAAND.format(naarUtc(datum)).replace('.', '');
}

const VOLLEDIG = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function volledigeDatum(datum: string): string {
  return VOLLEDIG.format(naarUtc(datum));
}

/** In-game geld: 1.000.000, met punten zoals in de spreadsheet. */
const GELD = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });

export function geld(bedrag: number): string {
  return GELD.format(Math.round(bedrag));
}
