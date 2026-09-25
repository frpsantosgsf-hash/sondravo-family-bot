import Link from 'next/link';
import { geld, korteDatum } from '@/lib/weken';
import type { LeadOverzicht } from '@/lib/lead';
import type { PotData, RegistryMember } from '@/types';

type Toon = 'oranje' | 'rood' | 'creme';

interface Punt {
  sleutel: string;
  titel: string;
  uitleg: string;
  href: string;
  toon: Toon;
  icoon: 'brief' | 'munt' | 'schakel' | 'slot';
}

const TONEN: Record<Toon, { rand: string; vlak: string; tekst: string; streep: string }> = {
  oranje: {
    rand: 'border-[#e0871f]/35',
    vlak: 'bg-[#e0871f]/[0.06]',
    tekst: 'text-[#f0ab5e]',
    streep: 'bg-[#e0871f]',
  },
  rood: {
    rand: 'border-sondravo-red/30',
    vlak: 'bg-sondravo-red/[0.05]',
    tekst: 'text-[#f2a9ac]',
    streep: 'bg-sondravo-red',
  },
  creme: {
    rand: 'border-line',
    vlak: 'bg-panel-high',
    tekst: 'text-creme',
    streep: 'bg-creme/60',
  },
};

/**
 * Wat er vandaag ligt, en verder niets.
 *
 * Alleen regels die iets van de Lead vragen komen hier terecht. Een lijst die
 * altijd vol staat leert je hem over te slaan; deze is leeg zodra alles bij
 * is, en dát maakt hem het lezen waard.
 */
export function Aandacht({
  overzicht,
  gangpot,
  leden,
  sollicitatiesOpen,
}: {
  overzicht: LeadOverzicht;
  gangpot: PotData;
  leden: RegistryMember[];
  sollicitatiesOpen: boolean;
}) {
  const punten: Punt[] = [];

  /*
   * Een storing hoort bovenaan. Zonder deze regel zou de leadkamer alleen
   * nullen laten zien, en die lezen als "er staat niets open" in plaats van
   * "ik kon niet kijken".
   */
  if (gangpot.error) {
    punten.push({
      sleutel: 'storing',
      titel: 'De gangpot is nog niet klaar',
      uitleg: gangpot.error,
      href: '/gangpot',
      toon: 'rood',
      icoon: 'munt',
    });
  }

  if (overzicht.nieuweSollicitaties > 0) {
    punten.push({
      sleutel: 'nieuw',
      titel: `${overzicht.nieuweSollicitaties} nieuwe ${
        overzicht.nieuweSollicitaties === 1 ? 'sollicitatie' : 'sollicitaties'
      }`,
      uitleg: 'Nog niemand heeft ernaar gekeken.',
      href: '/sollicitaties',
      toon: 'oranje',
      icoon: 'brief',
    });
  }

  if (overzicht.wachtOpBesluit > 0) {
    punten.push({
      sleutel: 'besluit',
      titel: `${overzicht.wachtOpBesluit} ${
        overzicht.wachtOpBesluit === 1 ? 'stemming is' : 'stemmingen zijn'
      } gesloten`,
      uitleg: 'De familie heeft gestemd. Alleen jij kunt nu aannemen of afwijzen.',
      href: '/sollicitaties',
      toon: 'oranje',
      icoon: 'brief',
    });
  }

  const dezeWeek = gangpot.weeks[gangpot.weeks.length - 1];
  if (dezeWeek && dezeWeek.due - dezeWeek.paid > 0) {
    const open = dezeWeek.due - dezeWeek.paid;
    punten.push({
      sleutel: 'gangpot',
      titel: `${open} ${open === 1 ? 'lid heeft' : 'leden hebben'} nog niet betaald`,
      uitleg: `Week ${dezeWeek.weekNumber} (${korteDatum(dezeWeek.friday)}) — ${geld(
        open * gangpot.weeklyAmount,
      )} te gaan.`,
      href: '/gangpot',
      toon: 'rood',
      icoon: 'munt',
    });
  }

  /*
   * Een lid zonder Discord-koppeling staat wel op de lijst, maar komt er zelf
   * niet in: de database laat hem geen enkele rij zien. Dat merkt hij pas als
   * hij het probeert, en dan is de Lead alsnog aan zet. Beter hier.
   */
  const ongekoppeld = leden.filter((lid) => !lid.discordUserId);
  if (ongekoppeld.length > 0) {
    punten.push({
      sleutel: 'koppeling',
      titel: `${ongekoppeld.length} ${
        ongekoppeld.length === 1 ? 'lid hangt' : 'leden hangen'
      } nog niet aan Discord`,
      uitleg: `${ongekoppeld
        .slice(0, 4)
        .map((lid) => lid.name)
        .join(', ')}${ongekoppeld.length > 4 ? ' en meer' : ''} — zij komen zelf niet op de site.`,
      href: '/leden',
      toon: 'creme',
      icoon: 'schakel',
    });
  }

  if (!sollicitatiesOpen) {
    punten.push({
      sleutel: 'dicht',
      titel: 'Sollicitaties staan dicht',
      uitleg: 'Niemand kan zich aanmelden. Hieronder zet je ze weer open.',
      href: '/sollicitaties',
      toon: 'creme',
      icoon: 'slot',
    });
  }

  if (punten.length === 0 && !gangpot.error) {
    return (
      <div className="panel flex items-center gap-4 border border-sondravo-green/25 bg-sondravo-green/[0.05] px-5 py-5">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sondravo-green/40 bg-sondravo-green/15 text-[#7ddba3]"
        >
          <Vinkje />
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm uppercase tracking-[0.12em] text-[#a8f0c6]">
            Alles is bij
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Geen open sollicitaties, iedereen heeft deze week betaald en elk lid is gekoppeld.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {punten.map((punt) => {
        const toon = TONEN[punt.toon];
        return (
          <li key={punt.sleutel}>
            <Link
              href={punt.href}
              className={`panel group relative flex items-center gap-3.5 overflow-hidden border px-4 py-4 transition-colors sm:px-5 ${toon.rand} ${toon.vlak} hover:border-creme/30`}
            >
              <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${toon.streep}`} />

              <span
                aria-hidden
                className={`ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${toon.rand} ${toon.tekst}`}
              >
                <Icoon naam={punt.icoon} />
              </span>

              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium leading-snug ${toon.tekst}`}>{punt.titel}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{punt.uitleg}</p>
              </div>

              <span
                aria-hidden
                className="shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5"
              >
                <Pijl />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const LIJN = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Icoon({ naam }: { naam: Punt['icoon'] }) {
  if (naam === 'brief') {
    return (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
        <rect x="3" y="5.5" width="18" height="13" rx="2.5" {...LIJN} />
        <path d="M3.8 7l8.2 6 8.2-6" {...LIJN} />
      </svg>
    );
  }
  if (naam === 'munt') {
    return (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
        <circle cx="12" cy="12" r="8.5" {...LIJN} />
        <path
          d="M12 7.5v9M14.5 9.8c0-1.1-1.1-1.8-2.5-1.8s-2.5.7-2.5 1.8 1.1 1.6 2.5 1.9 2.5.8 2.5 1.9-1.1 1.8-2.5 1.8-2.5-.7-2.5-1.8"
          {...LIJN}
        />
      </svg>
    );
  }
  if (naam === 'schakel') {
    return (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
        <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1.3 1.3" {...LIJN} />
        <path d="M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1.3-1.3" {...LIJN} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" {...LIJN} />
      <path d="M8 10.5V8a4 4 0 018 0v2.5" {...LIJN} />
    </svg>
  );
}

function Pijl() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path d="M9 5l7 7-7 7" {...LIJN} />
    </svg>
  );
}

function Vinkje() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path d="M5 13l4 4L19 7" {...LIJN} strokeWidth={2.2} />
    </svg>
  );
}
