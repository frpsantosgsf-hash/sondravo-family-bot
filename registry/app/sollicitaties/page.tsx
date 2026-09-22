import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { AuthControls } from '@/components/site/AuthControls';
import { ApplicationsPanel } from '@/components/applications/ApplicationsPanel';
import { getViewerAccess, mayViewRegistry } from '@/lib/access';
import { getRegistryData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sollicitaties',
  description: 'Openstaande sollicitaties bij The Sondravo Family.',
  robots: { index: false, follow: false },
};

export default async function SollicitatiesPage() {
  const [access, { settings, viewer }] = await Promise.all([getViewerAccess(), getRegistryData()]);

  if (!mayViewRegistry(access)) {
    return (
      <>
        <SiteNav viewer={viewer} current="/sollicitaties" showRegistry={false} />

        <main id="hoofdinhoud" className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="rounded-xl border border-line bg-panel px-5 py-7 text-center sm:px-8 sm:py-9">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              Besloten
            </p>
            <h1 className="mt-2 font-display text-xl uppercase tracking-[0.1em] text-creme sm:text-2xl">
              Alleen voor de familie
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-ink/80">
              Alleen leden van Sondravo kunnen de sollicitaties bekijken en erover stemmen.
            </p>

            {!access.signedIn ? (
              <div className="mt-6 flex justify-center">
                <AuthControls viewer={null} next="/sollicitaties" label="Inloggen met Discord" />
              </div>
            ) : (
              <Link
                href="/"
                className="tap-target mt-6 inline-flex items-center justify-center rounded-lg border border-line bg-panel-high px-5 text-[13px] uppercase tracking-[0.14em] text-ink transition-colors hover:border-creme/25"
              >
                Terug naar de voorpagina
              </Link>
            )}
          </div>
        </main>

        <SiteFooter familyName={settings.familyName} />
      </>
    );
  }

  return (
    <>
      <SiteNav viewer={viewer} current="/sollicitaties" />

      <main id="hoofdinhoud" className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            {settings.familyName}
          </p>
          <h1 className="mt-1.5 font-display text-2xl uppercase tracking-[0.1em] text-creme sm:text-3xl">
            Sollicitaties
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Iedereen in de familie mag hier zijn stem geven. Jouw stem is advies — de Lead neemt
            het besluit. Nog een keer op dezelfde knop klikken trekt je stem weer in.
          </p>
        </header>

        <Link
          href="/leden"
          className="tap-target mt-5 inline-flex items-center gap-2 rounded-lg border border-line bg-panel-high px-4 text-[13px] uppercase tracking-[0.14em] text-ink transition-colors hover:border-creme/25 sm:hidden"
        >
          Naar de ledenlijst
        </Link>

        <div className="mt-6 sm:mt-8">
          <ApplicationsPanel isAdmin={viewer?.isAdmin === true} />
        </div>
      </main>

      <SiteFooter familyName={settings.familyName} />
    </>
  );
}
