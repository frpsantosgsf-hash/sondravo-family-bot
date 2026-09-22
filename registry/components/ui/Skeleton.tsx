export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-shimmer rounded bg-panel-high ${className}`} aria-hidden />;
}

/** Placeholder die de vorm van de ledenlijst aanhoudt, zodat er niets springt. */
export function RegistrySkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Ledenlijst wordt geladen">
      {[3, 6].map((rows, groupIndex) => (
        <section key={groupIndex} className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-px flex-1" />
            <Skeleton className="h-3.5 w-6" />
          </div>
          <div className="panel divide-y divide-line-soft overflow-hidden">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <div key={rowIndex} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <Skeleton className="h-11 w-11 shrink-0 rounded-full sm:h-12 sm:w-12" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-40 max-w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
