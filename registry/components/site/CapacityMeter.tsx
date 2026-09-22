interface CapacityMeterProps {
  total: number;
  limit: number;
  /** `hero` is groter en gecentreerd, `header` compacter. */
  variant?: 'hero' | 'header';
}

/**
 * De ledenteller met capaciteitsbalk.
 *
 * De getallen komen altijd uit de database: `total` is een telling van de
 * ledentabel, `limit` staat in settings en is door een admin aanpasbaar.
 */
export function CapacityMeter({ total, limit, variant = 'header' }: CapacityMeterProps) {
  const safeLimit = Math.max(limit, 1);
  const percentage = Math.min(100, Math.round((total / safeLimit) * 100));
  const full = total >= safeLimit;
  const free = Math.max(0, safeLimit - total);

  return (
    <div className={variant === 'hero' ? 'w-full max-w-xs' : 'w-full max-w-[220px]'}>
      <div className="flex items-baseline justify-between gap-3">
        <p
          className={`font-display font-semibold tracking-[0.12em] text-creme ${
            variant === 'hero' ? 'text-2xl' : 'text-lg'
          }`}
        >
          {total}
          <span className="text-muted"> / {safeLimit}</span>
          <span className="ml-1.5 text-[11px] uppercase tracking-[0.24em] text-muted">Members</span>
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={total}
        aria-valuemin={0}
        aria-valuemax={safeLimit}
        aria-label={`${total} van ${safeLimit} plekken bezet`}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel-high ring-1 ring-inset ring-line"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            full
              ? 'bg-gradient-to-r from-sondravo-red/70 to-sondravo-red'
              : 'bg-gradient-to-r from-creme/45 to-creme'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <p className="mt-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-soft">
        {full ? 'Vol — geen plekken vrij' : `${free} ${free === 1 ? 'plek' : 'plekken'} vrij`}
      </p>
    </div>
  );
}
