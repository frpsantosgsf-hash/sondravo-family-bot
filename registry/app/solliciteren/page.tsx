import type { Metadata } from 'next';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ApplicationForm } from '@/components/site/ApplicationForm';
import { AuthControls } from '@/components/site/AuthControls';
import { getViewerAccess, mayApply, mayViewRegistry } from '@/lib/access';
import { getRegistryData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Solliciteren',
  description: 'Solliciteer bij The Sondravo Family.',
  robots: { index: false, follow: false },
};

function Kader({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-5 py-6 sm:px-7 sm:py-8">
      {children}
    </div>
  );
}

export default async function SolliciterenPage() {
  const [access, { settings, viewer }] = await Promise.all([getViewerAccess(), getRegistryData()]);

  const toegang = mayApply(access);

  return (
    <>
      <SiteNav viewer={viewer} current="/solliciteren" showRegistry={mayViewRegistry(access)} />

      <main id="hoofdinhoud" className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            {settings.familyName}
          </p>
          <h1 className="mt-2 font-display text-2xl uppercase tracking-[0.1em] text-creme sm:text-3xl">
            Solliciteren
          </h1>
        </header>

        <div className="mt-7 sm:mt-9">
          {!access.signedIn ? (
            <Kader>
              <p className="text-sm leading-relaxed text-ink/80">
                Om te kunnen solliciteren log je eerst in met Discord. Zo weten we zeker met wie we
                te maken hebben, en hoef jij je gegevens niet twee keer achter te laten.
              </p>
              <div className="mt-5">
                <AuthControls viewer={null} next="/solliciteren" />
              </div>
            </Kader>
          ) : access.discordUnavailable ? (
            <Kader>
              <p className="text-sm leading-relaxed text-ink/80">
                Discord is op dit moment niet bereikbaar, dus we kunnen je rol even niet
                controleren. Probeer het over een paar minuten nog eens — er is niets mis met jouw
                account.
              </p>
            </Kader>
          ) : !toegang ? (
            <Kader>
              <p className="text-sm leading-relaxed text-ink/80">
                Je bent ingelogd, maar je hebt in onze Discord-server nog niet de rol die toegang
                geeft tot het sollicitatieformulier.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Vraag in de server om die rol. Zodra je hem hebt, ververs je deze pagina en kun je
                meteen verder.
              </p>
            </Kader>
          ) : (
            <Kader>
              <ApplicationForm />
            </Kader>
          )}
        </div>
      </main>

      <SiteFooter familyName={settings.familyName} />
    </>
  );
}
