import type { Metadata } from 'next';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { RegistryHeader } from '@/components/registry/RegistryHeader';
import { RegistryView } from '@/components/registry/RegistryView';
import Link from 'next/link';
import { AuthControls } from '@/components/site/AuthControls';
import { getRegistryData } from '@/lib/data';
import { getViewerAccess, isUnlinkedFamily, mayApply, mayViewRegistry } from '@/lib/access';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ledenlijst',
  description: 'Official member registry of The Sondravo Family.',
  // De lijst is besloten, dus hij hoort niet in Google te belanden.
  robots: { index: false, follow: false },
};

export default async function LedenPage() {
  const [access, registry] = await Promise.all([getViewerAccess(), getRegistryData()]);
  const { members, ranks, settings, viewer, configError } = registry;

  /*
   * De lijst is besloten. Dit scherm is de vriendelijke uitleg; de echte
   * beveiliging zit in Row Level Security, die een buitenstaander sowieso
   * nul rijen teruggeeft.
   */
  if (!mayViewRegistry(access)) {
    return (
      <>
        <SiteNav viewer={viewer} current="/leden" showRegistry={false} />

        <main id="hoofdinhoud" className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="rounded-xl border border-line bg-panel px-5 py-7 text-center sm:px-8 sm:py-9">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              Besloten
            </p>
            <h1 className="mt-2 font-display text-xl uppercase tracking-[0.1em] text-creme sm:text-2xl">
              Alleen voor de familie
            </h1>

            <p className="mt-4 text-sm leading-relaxed text-ink/80">
              {!access.signedIn
                ? 'De ledenlijst is niet openbaar. Log in met Discord; hoor je bij de familie, dan opent de lijst vanzelf.'
                : access.discordUnavailable
                  ? 'Discord is even niet bereikbaar, dus we kunnen je rol niet controleren. Probeer het zo nog eens.'
                  : isUnlinkedFamily(access)
                    ? 'Je draagt de familierol wel, maar je Discord-account hangt nog niet aan een lid op de lijst. Vraag een Lead om "Uit rollen halen" te draaien, dan ben je er meteen bij.'
                    : 'Je bent ingelogd, maar je draagt de familierol niet in onze Discord-server. Daarom blijft de ledenlijst dicht.'}
            </p>

            {!access.signedIn ? (
              <div className="mt-6 flex justify-center">
                <AuthControls viewer={null} next="/leden" label="Inloggen met Discord" />
              </div>
            ) : mayApply(access) ? (
              <Link
                href="/solliciteren"
                className="tap-target mt-6 inline-flex items-center justify-center rounded-lg bg-creme px-5 text-[13px] font-semibold uppercase tracking-[0.16em] text-void transition-opacity hover:opacity-90"
              >
                Solliciteren
              </Link>
            ) : null}
          </div>
        </main>

        <SiteFooter familyName={settings.familyName} />
      </>
    );
  }

  return (
    <>
      <SiteNav viewer={viewer} current="/leden" />

      <main id="hoofdinhoud" className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <RegistryHeader
          familyName={settings.familyName}
          total={members.length}
          limit={settings.memberLimit}
        />

        {configError ? (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-sondravo-red/35 bg-sondravo-red/10 px-4 py-3 text-sm leading-relaxed text-[#f2a9ac]"
          >
            {configError}
          </p>
        ) : null}

        {/* Op een telefoon blijven de links in de balk bovenaan verborgen,
            dus hier staat de weg naar het stemmen nog een keer. */}
        <Link
          href="/sollicitaties"
          className="tap-target mt-5 inline-flex items-center gap-2 rounded-lg border border-line bg-panel-high px-4 text-[13px] uppercase tracking-[0.14em] text-ink transition-colors hover:border-creme/25 sm:hidden"
        >
          Sollicitaties bekijken
        </Link>

        <div className="mt-6 sm:mt-8">
          <RegistryView members={members} ranks={ranks} settings={settings} viewer={viewer} />
        </div>
      </main>

      <SiteFooter familyName={settings.familyName} />
    </>
  );
}
