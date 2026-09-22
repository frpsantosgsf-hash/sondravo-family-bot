import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Inloggen mislukt',
  robots: { index: false, follow: false },
};

const REASONS: Record<string, string> = {
  config:
    'De site is nog niet gekoppeld aan Supabase. Zet de environment variables goed en probeer het opnieuw.',
  oauth: 'We konden de Discord-login niet starten. Controleer of de Discord-provider in Supabase aanstaat.',
  denied: 'Je hebt de toegang in Discord geweigerd.',
  exchange:
    'De login is niet afgerond. Controleer of deze URL als redirect-URL in Supabase staat en probeer het opnieuw.',
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = REASONS[reason ?? ''] ?? 'Er ging iets mis tijdens het inloggen.';

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
        <h1 className="text-xl font-semibold tracking-wide text-ink">Inloggen mislukt</h1>
        <p className="text-sm leading-relaxed text-pretty text-muted">{message}</p>
      </div>
      <Link
        href="/"
        className="tap-target inline-flex items-center rounded-lg border border-line bg-panel-high px-4 text-sm text-ink transition-colors hover:border-creme/25 hover:bg-panel-hover"
      >
        Terug naar de site
      </Link>
    </main>
  );
}
