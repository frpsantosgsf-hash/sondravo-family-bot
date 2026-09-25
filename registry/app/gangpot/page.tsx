import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { AuthControls } from '@/components/site/AuthControls';
import { GangpotBoard } from '@/components/gangpot/GangpotBoard';
import { MobieleLinks } from '@/components/site/MobieleLinks';
import { getRegistryData } from '@/lib/data';
import { getGangpotData } from '@/lib/gangpot';
import { getViewerAccess, isUnlinkedFamily, mayApply, mayViewRegistry } from '@/lib/access';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gangpot',
  description: 'De kas van The Sondravo Family.',
  // Interne administratie hoort niet in een zoekmachine.
  robots: { index: false, follow: false },
};

export default async function GangpotPage() {
  const [access, registry] = await Promise.all([getViewerAccess(), getRegistryData()]);
  const { ranks, settings, viewer } = registry;

  /*
   * Dezelfde deur als de ledenlijst. Dit scherm is de uitleg; het slot zit in
   * Row Level Security, die een buitenstaander sowieso niets teruggeeft.
   */
  if (!mayViewRegistry(access)) {
    return (
      <>
        <SiteNav viewer={viewer} current="/gangpot" showRegistry={false} />

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
                ? 'De gangpot is de kas van de familie. Log in met Discord; hoor je erbij, dan opent hij vanzelf.'
                : access.discordUnavailable
                  ? 'Discord is even niet bereikbaar, dus we kunnen je rol niet controleren. Probeer het zo nog eens.'
                  : isUnlinkedFamily(access)
                    ? 'Je draagt de familierol wel, maar je Discord-account hangt nog niet aan een lid op de lijst. Vraag een Lead om "Uit rollen halen" te draaien, dan ben je er meteen bij.'
                    : 'Je bent ingelogd, maar je draagt de familierol niet in onze Discord-server. Daarom blijft de gangpot dicht.'}
            </p>

            {!access.signedIn ? (
              <div className="mt-6 flex justify-center">
                <AuthControls viewer={null} next="/gangpot" label="Inloggen met Discord" />
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

  const gangpot = await getGangpotData();

  return (
    <>
      <SiteNav viewer={viewer} current="/gangpot" />

      <main id="hoofdinhoud" className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            {settings.familyName}
          </p>
          <h1 className="mt-1.5 font-display text-2xl uppercase tracking-[0.08em] text-creme sm:text-3xl">
            Gangpot
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Iedereen legt elke vrijdag in, de Lead boekt wat eruit gaat. Het saldo is altijd
            beginsaldo plus wat er binnenkwam, min wat er is uitgegeven.
          </p>
        </header>

        <MobieleLinks current="/gangpot" />

        {gangpot.error ? (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-sondravo-red/35 bg-sondravo-red/10 px-4 py-3 text-sm leading-relaxed text-[#f2a9ac]"
          >
            {gangpot.error}
          </p>
        ) : null}

        <div className="mt-6 sm:mt-8">
          <GangpotBoard initial={gangpot} ranks={ranks} />
        </div>
      </main>

      <SiteFooter familyName={settings.familyName} />
    </>
  );
}
