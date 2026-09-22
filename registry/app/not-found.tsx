import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      id="hoofdinhoud"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-5 text-center"
    >
      <p className="font-display text-5xl font-semibold tracking-[0.1em] text-creme">404</p>
      <div className="space-y-2">
        <h1 className="text-lg font-semibold tracking-wide text-ink">Deze pagina bestaat niet</h1>
        <p className="text-sm leading-relaxed text-muted">
          Misschien zoek je de ledenlijst?
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/leden"
          className="tap-target inline-flex items-center justify-center rounded-lg bg-creme px-5 text-sm font-semibold uppercase tracking-[0.14em] text-void transition-colors hover:bg-white"
        >
          Naar de ledenlijst
        </Link>
        <Link
          href="/"
          className="tap-target inline-flex items-center justify-center rounded-lg border border-line bg-panel-high px-5 text-sm text-ink transition-colors hover:border-creme/25 hover:bg-panel-hover"
        >
          Voorpagina
        </Link>
      </div>
    </main>
  );
}
