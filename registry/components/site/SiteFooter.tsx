import Link from 'next/link';

export function SiteFooter({ familyName }: { familyName: string }) {
  return (
    <footer className="mt-20 border-t border-line/70">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
        <p className="text-xs leading-relaxed text-muted-soft">
          {familyName} — Official Family Registry
        </p>
        <nav aria-label="Voettekst" className="flex items-center gap-4 text-xs text-muted">
          <Link href="/" className="transition-colors hover:text-ink">
            Home
          </Link>
          <Link href="/leden" className="transition-colors hover:text-ink">
            Ledenlijst
          </Link>
        </nav>
      </div>
    </footer>
  );
}
