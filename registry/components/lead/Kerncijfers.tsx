import Link from 'next/link';
import { geld } from '@/lib/weken';

interface Cijfer {
  label: string;
  waarde: string;
  bij: string;
  href: string;
  toon: 'groen' | 'creme' | 'rood';
}

/**
 * De drie getallen waar een Lead 's ochtends naar kijkt.
 *
 * Elke tegel is een link. Een cijfer dat je niet kunt uitdiepen is een cijfer
 * waar je niets mee kunt.
 */
export function Kerncijfers({
  saldo,
  leden,
  limiet,
  openstaand,
  dezeWeek,
}: {
  saldo: number;
  leden: number;
  limiet: number;
  openstaand: number;
  /** De lopende betaalweek, of null zolang de eerste vrijdag nog moet komen. */
  dezeWeek: { weekNumber: number; paid: number; due: number } | null;
}) {
  const cijfers: Cijfer[] = [
    {
      label: 'In de pot',
      waarde: geld(saldo),
      bij: openstaand > 0 ? `${geld(openstaand)} nog te betalen` : 'iedereen is bij',
      href: '/gangpot',
      toon: 'groen',
    },
    {
      label: 'Leden',
      waarde: `${leden}`,
      bij: `van ${limiet} plekken`,
      href: '/leden',
      toon: 'creme',
    },
    {
      // Bewust niet nóg een keer "nog te betalen": dat getal staat al onder
      // het saldo. Deze tegel beantwoordt de andere vraag — hoe staat het er
      // déze week voor.
      label: dezeWeek ? `Week ${dezeWeek.weekNumber}` : 'Deze week',
      waarde: dezeWeek ? `${dezeWeek.paid} / ${dezeWeek.due}` : '—',
      bij: dezeWeek
        ? dezeWeek.paid >= dezeWeek.due
          ? 'iedereen heeft betaald'
          : `${dezeWeek.due - dezeWeek.paid} nog niet betaald`
        : 'de eerste vrijdag moet nog komen',
      href: '/gangpot',
      toon: dezeWeek && dezeWeek.paid < dezeWeek.due ? 'rood' : 'groen',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cijfers.map((cijfer, index) => (
        <Link
          key={cijfer.label}
          href={cijfer.href}
          className={`panel group border border-line px-4 py-4 transition-colors hover:border-creme/25 hover:bg-panel-high ${
            // Op een telefoon staan er twee naast elkaar; de derde krijgt de
            // volle breedte in plaats van een gat naast zich.
            index === 2 ? 'col-span-2 sm:col-span-1' : ''
          }`}
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
            {cijfer.label}
          </p>
          <p
            className={`mt-1.5 font-display text-xl tabular-nums sm:text-2xl ${
              cijfer.toon === 'groen'
                ? 'text-[#a8f0c6]'
                : cijfer.toon === 'rood'
                  ? 'text-[#f2a9ac]'
                  : 'text-creme'
            }`}
          >
            {cijfer.waarde}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-soft">{cijfer.bij}</p>
        </Link>
      ))}
    </div>
  );
}
