'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Alleen de digest loggen: de volledige fout kan gevoelige details bevatten.
    if (error.digest) {
      console.error(`Renderfout (digest: ${error.digest})`);
    }
  }, [error.digest]);

  return (
    <main
      id="hoofdinhoud"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-5 text-center"
    >
      <div
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-full border border-sondravo-red/40 bg-sondravo-red/10 text-2xl text-[#f2a9ac]"
      >
        !
      </div>
      <div className="space-y-2">
        <h1 className="text-lg font-semibold tracking-wide text-ink">Er ging iets mis</h1>
        <p className="text-sm leading-relaxed text-pretty text-muted">
          De ledenlijst kon even niet geladen worden. Probeer het opnieuw.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="tap-target inline-flex items-center justify-center rounded-lg bg-creme px-5 text-sm font-semibold uppercase tracking-[0.14em] text-void transition-colors hover:bg-white"
      >
        Opnieuw proberen
      </button>
    </main>
  );
}
