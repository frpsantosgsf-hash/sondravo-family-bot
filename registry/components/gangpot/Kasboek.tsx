'use client';

import { Button } from '@/components/ui/Button';
import { geld, korteDatum } from '@/lib/weken';
import type { PotEntry } from '@/types';

interface KasboekProps {
  expenses: PotEntry[];
  income: PotEntry[];
  isAdmin: boolean;
  onToevoegen: (soort: 'expense' | 'income') => void;
  onVerwijderen: (soort: 'expense' | 'income', regel: PotEntry) => void;
}

/**
 * Uitgaven en inkomsten onder elkaar.
 *
 * Twee lijsten en niet één met plus- en mintekens: een verkeerd teken is de
 * makkelijkste fout in een kasboek, en hier kan hij niet gemaakt worden. De
 * kleur en het voorteken volgen uit de lijst waar je in staat.
 */
export function Kasboek({ expenses, income, isAdmin, onToevoegen, onVerwijderen }: KasboekProps) {
  return (
    <div className="space-y-6">
      <Lijst
        titel="Uitgaven"
        toelichting="Betaald uit de pot"
        soort="expense"
        regels={expenses}
        isAdmin={isAdmin}
        onToevoegen={onToevoegen}
        onVerwijderen={onVerwijderen}
      />
      <Lijst
        titel="Inkomsten"
        toelichting="Buiten de wekelijkse bijdragen om"
        soort="income"
        regels={income}
        isAdmin={isAdmin}
        onToevoegen={onToevoegen}
        onVerwijderen={onVerwijderen}
      />
    </div>
  );
}

interface LijstProps extends Omit<KasboekProps, 'expenses' | 'income'> {
  titel: string;
  toelichting: string;
  soort: 'expense' | 'income';
  regels: PotEntry[];
}

function Lijst({
  titel,
  toelichting,
  soort,
  regels,
  isAdmin,
  onToevoegen,
  onVerwijderen,
}: LijstProps) {
  const isUitgave = soort === 'expense';
  const totaal = regels.reduce((som, regel) => som + regel.amount, 0);
  const kleur = isUitgave ? 'text-[#f2a9ac]' : 'text-[#7ddba3]';

  return (
    <section className="panel overflow-hidden border border-line">
      <header className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h3 className="font-display text-sm uppercase tracking-[0.14em] text-creme">{titel}</h3>
          <p className="mt-0.5 truncate text-[11px] text-muted">{toelichting}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className={`font-display text-base tabular-nums ${kleur}`}>
            {isUitgave ? '−' : '+'}
            {geld(totaal)}
          </span>
          {isAdmin ? (
            <Button size="sm" variant="secondary" onClick={() => onToevoegen(soort)}>
              <Plus />
              <span className="sr-only sm:not-sr-only">Nieuw</span>
            </Button>
          ) : null}
        </div>
      </header>

      {regels.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted sm:px-5">Nog niets geboekt.</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {regels.map((regel) => (
            <li key={regel.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <span
                aria-hidden
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                  isUitgave
                    ? 'border-sondravo-red/30 bg-sondravo-red/10 text-[#f2a9ac]'
                    : 'border-sondravo-green/35 bg-sondravo-green/10 text-[#7ddba3]'
                }`}
              >
                {isUitgave ? <PijlUit /> : <PijlIn />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-ink">{regel.description}</p>

                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Kalender />
                    {korteDatum(regel.date)}
                  </span>
                  {regel.who ? (
                    <span className="inline-flex items-center gap-1">
                      <Persoon />
                      {regel.who}
                    </span>
                  ) : null}
                </p>

                {regel.note ? (
                  <p className="mt-1.5 inline-flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-soft">
                    <Notitie />
                    <span className="min-w-0">{regel.note}</span>
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className={`font-display text-sm tabular-nums ${kleur}`}>
                  {isUitgave ? '−' : '+'}
                  {geld(regel.amount)}
                </span>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => onVerwijderen(soort, regel)}
                    className="rounded-md p-1 text-muted-soft transition-colors hover:bg-panel-high hover:text-[#f2a9ac]"
                    aria-label={`${regel.description} verwijderen`}
                  >
                    <Prullenbak />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --- iconen ---------------------------------------------------------------
   Klein, in currentColor, zodat ze de kleur van hun omgeving aannemen.
   -------------------------------------------------------------------------- */

const LIJN = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Plus() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path d="M12 5v14M5 12h14" {...LIJN} strokeWidth={2} />
    </svg>
  );
}

function PijlUit() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path d="M12 19V5M12 19l-5-5M12 19l5-5" {...LIJN} />
    </svg>
  );
}

function PijlIn() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path d="M12 5v14M12 5L7 10M12 5l5 5" {...LIJN} />
    </svg>
  );
}

function Kalender() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" {...LIJN} />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" {...LIJN} />
    </svg>
  );
}

function Persoon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <circle cx="12" cy="8" r="3.5" {...LIJN} />
      <path d="M4.5 20a7.5 7.5 0 0115 0" {...LIJN} />
    </svg>
  );
}

function Notitie() {
  return (
    <svg viewBox="0 0 24 24" className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden>
      <path
        d="M6 3.5h9l5 5V20a1.5 1.5 0 01-1.5 1.5h-12A1.5 1.5 0 015 20V5A1.5 1.5 0 016.5 3.5z"
        {...LIJN}
      />
      <path d="M14.5 3.5V9h5.5M8.5 13h7M8.5 17h5" {...LIJN} />
    </svg>
  );
}

function Prullenbak() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        d="M5 7h14M10 7V5h4v2M7 7l.8 12.1A1.5 1.5 0 009.3 20.5h5.4a1.5 1.5 0 001.5-1.4L17 7"
        {...LIJN}
      />
    </svg>
  );
}
