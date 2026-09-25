'use client';

import { Avatar } from '@/components/registry/Avatar';
import { Spinner } from '@/components/ui/Button';
import { rankAccent } from '@/lib/ranks';
import { displayName } from '@/lib/format';
import { dagenTot, deadlineVan, geld, volledigeDatum } from '@/lib/weken';
import type { PotData, Rank } from '@/types';

interface WeekLijstProps {
  data: PotData;
  ranks: Rank[];
  /** De vrijdag die nu getoond wordt. */
  vrijdag: string;
  onVrijdag: (waarde: string) => void;
  onToggle: (memberId: string, betaald: boolean) => void;
  /** Het lid waar nu een verzoek voor loopt. */
  bezig: string | null;
}

/**
 * Eén week, alle leden onder elkaar.
 *
 * Dit is bewust géén raster van twintig leden bij achttien weken. Dat past op
 * geen enkele telefoon, en je kijkt in de praktijk altijd naar één week: die
 * van vandaag. De geschiedenis staat op zijn eigen tabblad.
 */
export function WeekLijst({ data, ranks, vrijdag, onVrijdag, onToggle, bezig }: WeekLijstProps) {
  const rangen = new Map(ranks.map((rang) => [rang.key, rang] as const));
  const index = data.weeks.findIndex((week) => week.friday === vrijdag);
  const week = data.weeks[index];

  if (!week) {
    return (
      <p className="panel border border-line px-5 py-8 text-center text-sm text-muted">
        Deze week valt buiten de gangpot.
      </p>
    );
  }

  const vorige = data.weeks[index - 1];
  const volgende = data.weeks[index + 1];
  const percentage = week.due === 0 ? 0 : Math.round((week.paid / week.due) * 100);

  /*
   * Er wordt op vrijdag ingelegd en je hebt tot de volgende vrijdag de tijd.
   * Die dag staat er daarom bij: zonder einddatum is "deze week" een begrip
   * waar iedereen zijn eigen invulling aan geeft.
   */
  const deadline = deadlineVan(week.friday);
  const dagen = dagenTot(deadline);
  const loopt = vrijdag === data.currentFriday;

  return (
    <div className="space-y-4">
      {/* --- weekkiezer ----------------------------------------------------- */}
      <div className="panel flex items-center justify-between gap-2 border border-line px-2 py-2">
        <button
          type="button"
          disabled={!vorige}
          onClick={() => vorige && onVrijdag(vorige.friday)}
          aria-label="Vorige week"
          className="tap-target flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel-high hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Pijl richting="links" />
        </button>

        <div className="min-w-0 text-center">
          <p className="font-display text-base uppercase tracking-[0.12em] text-creme">
            Week {week.weekNumber}
          </p>
          <p className="truncate text-[11px] text-muted">vrijdag {volledigeDatum(week.friday)}</p>
        </div>

        <button
          type="button"
          disabled={!volgende}
          onClick={() => volgende && onVrijdag(volgende.friday)}
          aria-label="Volgende week"
          className="tap-target flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel-high hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Pijl richting="rechts" />
        </button>
      </div>

      {/* --- stand van de week ---------------------------------------------- */}
      <div className="panel border border-line px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-ink">
            <span className="font-display text-xl tabular-nums text-creme">{week.paid}</span>
            <span className="text-muted"> / {week.due} betaald</span>
          </p>
          <p className="text-sm tabular-nums text-[#7ddba3]">{geld(week.received)}</p>
        </div>

        <div
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${week.paid} van ${week.due} leden hebben betaald`}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-[#2fa36b] transition-[width] duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-soft">
          {loopt
            ? week.paid >= week.due
              ? `Iedereen is bij. Volgende inleg op vrijdag ${volledigeDatum(deadline)}.`
              : `Betalen kan tot vrijdag ${volledigeDatum(deadline)}${
                  dagen > 0 ? ` — nog ${dagen} ${dagen === 1 ? 'dag' : 'dagen'}` : ''
                }.`
            : `Deze week liep af op vrijdag ${volledigeDatum(deadline)}.`}
        </p>
      </div>

      {/* --- de leden -------------------------------------------------------- */}
      <ul className="panel divide-y divide-line/60 overflow-hidden border border-line">
        {data.members.map((lid) => {
          const rang = rangen.get(lid.rank);
          const accent = rankAccent(rang?.color ?? '');
          const stand = lid.weeks[vrijdag] ?? 'nvt';
          const betaald = stand === 'betaald';
          const telMee = stand !== 'nvt';
          const ikZelf = lid.id === data.meId;

          return (
            <li
              key={lid.id}
              className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${
                ikZelf ? 'bg-creme/[0.04]' : ''
              }`}
            >
              <Avatar name={lid.name} src={lid.avatarUrl} ring={accent.ring} size="sm" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {displayName(lid.name)}
                  {ikZelf ? (
                    <span className="ml-1.5 text-[10px] uppercase tracking-[0.16em] text-muted">
                      jij
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted">
                  {rang?.label ?? lid.rank}
                  {lid.openWeeks > 0 ? (
                    <span className="text-[#f2a9ac]">
                      {' · '}
                      {lid.openWeeks} {lid.openWeeks === 1 ? 'week' : 'weken'} open
                    </span>
                  ) : (
                    <span className="text-[#7ddba3]"> · helemaal bij</span>
                  )}
                </p>
              </div>

              {!telMee ? (
                <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-soft">
                  Nog geen lid
                </span>
              ) : data.isAdmin ? (
                <button
                  type="button"
                  onClick={() => onToggle(lid.id, !betaald)}
                  disabled={bezig !== null}
                  aria-pressed={betaald}
                  className={`tap-target flex shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium uppercase tracking-[0.12em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-55 ${
                    betaald
                      ? 'border-sondravo-green/50 bg-sondravo-green/15 text-[#7ddba3] hover:border-sondravo-green/80'
                      : 'border-line bg-panel-high text-muted hover:border-creme/25 hover:text-ink'
                  }`}
                >
                  {bezig === lid.id ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : betaald ? (
                    <Vinkje />
                  ) : (
                    <Kruisje />
                  )}
                  {betaald ? 'Betaald' : 'Open'}
                </button>
              ) : (
                <span
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.12em] ${
                    betaald
                      ? 'border-sondravo-green/50 bg-sondravo-green/15 text-[#7ddba3]'
                      : 'border-sondravo-red/35 bg-sondravo-red/10 text-[#f2a9ac]'
                  }`}
                >
                  {betaald ? 'Betaald' : 'Open'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Pijl({ richting }: { richting: 'links' | 'rechts' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path
        d={richting === 'links' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Vinkje() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Kruisje() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
