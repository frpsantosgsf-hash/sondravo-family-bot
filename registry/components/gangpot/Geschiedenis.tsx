'use client';

import { Avatar } from '@/components/registry/Avatar';
import { rankAccent } from '@/lib/ranks';
import { displayName } from '@/lib/format';
import { geld, korteDatum } from '@/lib/weken';
import type { PotData, Rank } from '@/types';

/**
 * Elk lid met zijn weken als rij bolletjes.
 *
 * De bolletjes lopen door op de volgende regel in plaats van opzij te
 * scrollen. Een raster dat je horizontaal moet slepen om week 42 te zien is
 * op een telefoon onbruikbaar, en dit past altijd — ook over een heel jaar.
 */
export function Geschiedenis({ data, ranks }: { data: PotData; ranks: Rank[] }) {
  const rangen = new Map(ranks.map((rang) => [rang.key, rang] as const));

  if (data.weeks.length === 0) {
    return (
      <p className="panel border border-line px-5 py-8 text-center text-sm text-muted">
        De eerste betaalvrijdag moet nog komen.
      </p>
    );
  }

  // Zwaarste achterstand bovenaan: dat is de lijst waar je iets mee moet.
  const leden = [...data.members].sort(
    (a, b) => b.openWeeks - a.openWeeks || a.name.localeCompare(b.name, 'nl'),
  );

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center gap-x-5 gap-y-2 border border-line px-4 py-3 text-[11px] text-muted sm:px-5">
        <Legenda kleur="bg-[#2fa36b]" tekst="Betaald" />
        <Legenda kleur="bg-sondravo-red/55" tekst="Open" />
        <Legenda kleur="bg-line" tekst="Nog geen lid" />
        <span className="text-muted-soft">
          week {data.weeks[0]?.weekNumber} t/m {data.weeks[data.weeks.length - 1]?.weekNumber}
        </span>
      </div>

      <ul className="panel divide-y divide-line/60 overflow-hidden border border-line">
        {leden.map((lid) => {
          const rang = rangen.get(lid.rank);
          const accent = rankAccent(rang?.color ?? '');

          return (
            <li key={lid.id} className="px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-3">
                <Avatar name={lid.name} src={lid.avatarUrl} ring={accent.ring} size="sm" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {displayName(lid.name)}
                    {lid.id === data.meId ? (
                      <span className="ml-1.5 text-[10px] uppercase tracking-[0.16em] text-muted">
                        jij
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {lid.openWeeks === 0 ? (
                      <span className="text-[#7ddba3]">alles betaald</span>
                    ) : (
                      <span className="text-[#f2a9ac]">
                        {lid.openWeeks} {lid.openWeeks === 1 ? 'week' : 'weken'} open ·{' '}
                        {geld(lid.openAmount)}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5 pl-[3.25rem]">
                {data.weeks.map((week) => {
                  const stand = lid.weeks[week.friday] ?? 'nvt';
                  return (
                    <span
                      key={week.friday}
                      title={`Week ${week.weekNumber} (${korteDatum(week.friday)}) — ${
                        stand === 'betaald'
                          ? 'betaald'
                          : stand === 'open'
                            ? 'niet betaald'
                            : 'nog geen lid'
                      }`}
                      className={`h-2.5 w-2.5 rounded-full ${
                        stand === 'betaald'
                          ? 'bg-[#2fa36b]'
                          : stand === 'open'
                            ? 'bg-sondravo-red/55'
                            : 'bg-line'
                      }`}
                    />
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Legenda({ kleur, tekst }: { kleur: string; tekst: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${kleur}`} />
      {tekst}
    </span>
  );
}
