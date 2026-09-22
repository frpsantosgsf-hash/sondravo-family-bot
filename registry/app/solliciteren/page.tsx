import type { Metadata } from 'next';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ApplicationForm } from '@/components/site/ApplicationForm';
import { AuthControls } from '@/components/site/AuthControls';
import { getViewerAccess, mayApply, mayViewRegistry } from '@/lib/access';
import { getRegistryData } from '@/lib/data';
import { getMyApplication } from '@/lib/applications';
import { formatDateTime } from '@/lib/format';

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

const STATUS_TEKST: Record<string, { kop: string; uitleg: string; toon: string }> = {
  nieuw: {
    kop: 'Je sollicitatie staat open',
    uitleg:
      'Hij is binnen en de familie kijkt ernaar. Je hoort het via Discord zodra er een besluit is.',
    toon: 'border-sondravo-green/40 bg-sondravo-green/10',
  },
  in_behandeling: {
    kop: 'Je sollicitatie wordt bekeken',
    uitleg: 'Een Lead is ermee bezig. Je hoort het via Discord zodra er een besluit is.',
    toon: 'border-creme/30 bg-creme/5',
  },
  aangenomen: {
    kop: 'Je bent aangenomen',
    uitleg: 'Welkom bij de familie. Een Lead neemt contact met je op in Discord.',
    toon: 'border-sondravo-green/40 bg-sondravo-green/10',
  },
  afgewezen: {
    kop: 'Je sollicitatie is afgewezen',
    uitleg: 'Je mag het later opnieuw proberen — vul het formulier hieronder dan gewoon nog eens in.',
    toon: 'border-sondravo-red/35 bg-sondravo-red/10',
  },
};

function StatusKaart({ status, ingestuurdOp }: { status: string; ingestuurdOp: string }) {
  const tekst = STATUS_TEKST[status];
  if (!tekst) return null;

  return (
    <div role="status" className={`rounded-xl border px-5 py-6 text-center ${tekst.toon}`}>
      <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-creme">{tekst.kop}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink/80">{tekst.uitleg}</p>
      <p className="mt-3 text-xs text-muted">Ingestuurd op {formatDateTime(ingestuurdOp)}.</p>
    </div>
  );
}

export default async function SolliciterenPage() {
  const [access, { settings, viewer }, mijn] = await Promise.all([
    getViewerAccess(),
    getRegistryData(),
    getMyApplication(),
  ]);

  const toegang = mayApply(access);
  // Een afgehandelde sollicitatie blokkeert niets meer: dan mag je opnieuw.
  const staatOpen = mijn !== null && ['nieuw', 'in_behandeling'].includes(mijn.status);

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
                Om te kunnen solliciteren log je eerst in met je eigen Discord-account. Zo weten we
                zeker met wie we te maken hebben, en hoef jij je gegevens niet twee keer achter te
                laten.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Je moet daarvoor wel in onze Discord-server zitten en de juiste rol hebben. Heb je
                die nog niet, vraag er dan eerst om in de server.
              </p>
              <div className="mt-5">
                <AuthControls
                  viewer={null}
                  next="/solliciteren"
                  label="Inloggen met Discord"
                />
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
          ) : staatOpen && mijn ? (
            <StatusKaart status={mijn.status} ingestuurdOp={mijn.created_at} />
          ) : (
            <>
              {mijn ? <StatusKaart status={mijn.status} ingestuurdOp={mijn.created_at} /> : null}
              <div className={mijn ? 'mt-5' : ''}>
                <Kader>
                  <ApplicationForm />
                </Kader>
              </div>
            </>
          )}
        </div>
      </main>

      <SiteFooter familyName={settings.familyName} />
    </>
  );
}
