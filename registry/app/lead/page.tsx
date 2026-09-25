import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { AuthControls } from '@/components/site/AuthControls';
import { Aandacht } from '@/components/lead/Aandacht';
import { Kerncijfers } from '@/components/lead/Kerncijfers';
import { SnelleActies } from '@/components/lead/SnelleActies';
import { Activiteit } from '@/components/lead/Activiteit';
import { getAuditLog, getRegistryData } from '@/lib/data';
import { getGangpotData } from '@/lib/gangpot';
import { getLeadOverzicht } from '@/lib/lead';
import { getViewerAccess } from '@/lib/access';
import { volledigeDatum, vandaag, weeknummer } from '@/lib/weken';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Leadkamer',
  description: 'Overzicht voor de leiding van The Sondravo Family.',
  robots: { index: false, follow: false },
};

const PAGINAS = [
  { href: '/leden', label: 'Ledenlijst' },
  { href: '/gangpot', label: 'Gangpot' },
  { href: '/sollicitaties', label: 'Sollicitaties' },
] as const;

/**
 * Eén scherm voor de Lead.
 *
 * Alles wat hier staat bestond al, maar lag verspreid over drie pagina's en
 * een instellingenvenster. Dat werkt zolang je weet waar je moet kijken —
 * en precies dat is wat je 's ochtends niet wilt hoeven weten.
 */
export default async function LeadPage() {
  const [access, registry] = await Promise.all([getViewerAccess(), getRegistryData()]);
  const { members, ranks, settings, viewer } = registry;

  if (!access.isAdmin) {
    return (
      <>
        <SiteNav viewer={viewer} current="/lead" showRegistry={false} />

        <main id="hoofdinhoud" className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="rounded-xl border border-line bg-panel px-5 py-7 text-center sm:px-8 sm:py-9">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              Alleen de leiding
            </p>
            <h1 className="mt-2 font-display text-xl uppercase tracking-[0.1em] text-creme sm:text-2xl">
              Leadkamer
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-ink/80">
              {access.signedIn
                ? 'Deze pagina is voor Lead- en Adminaccounts. Jouw account heeft die rechten niet.'
                : 'Log in met Discord. Heb je beheerrechten, dan opent deze pagina vanzelf.'}
            </p>

            {!access.signedIn ? (
              <div className="mt-6 flex justify-center">
                <AuthControls viewer={null} next="/lead" label="Inloggen met Discord" />
              </div>
            ) : null}
          </div>
        </main>

        <SiteFooter familyName={settings.familyName} />
      </>
    );
  }

  const [gangpot, overzicht, geschiedenis] = await Promise.all([
    getGangpotData(),
    getLeadOverzicht(),
    getAuditLog(6),
  ]);

  const nu = vandaag();
  // Alleen de voornaam: "Goedemorgen Lahaye" leest prettiger dan de hele
  // Discord-naam met tag erachter.
  const naam = (viewer?.name ?? '').split(/[\s|]/).filter(Boolean)[0] ?? '';

  return (
    <>
      <SiteNav viewer={viewer} current="/lead" />

      <main id="hoofdinhoud" className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            Week {weeknummer(nu)} · {volledigeDatum(nu)}
          </p>
          <h1 className="mt-1.5 font-display text-2xl uppercase tracking-[0.08em] text-creme sm:text-3xl">
            {naam ? `Welkom, ${naam}` : 'Leadkamer'}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Alles wat vandaag jouw aandacht vraagt, op één plek.
          </p>
        </header>

        <div className="mt-6 space-y-6 sm:mt-8 sm:space-y-8">
          <Aandacht
            overzicht={overzicht}
            gangpot={gangpot}
            leden={members}
            sollicitatiesOpen={settings.applicationsOpen}
          />

          <Kerncijfers
            saldo={gangpot.error ? null : gangpot.totals.balance}
            leden={members.length}
            limiet={settings.memberLimit}
            openstaand={gangpot.totals.outstanding}
            dezeWeek={gangpot.weeks[gangpot.weeks.length - 1] ?? null}
          />

          <section aria-labelledby="acties-kop">
            <h2
              id="acties-kop"
              className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted"
            >
              Snelle acties
            </h2>
            <SnelleActies sollicitatiesOpen={settings.applicationsOpen} />
          </section>

          <Activiteit entries={geschiedenis} ranks={ranks} />

          <nav aria-label="De rest van de site" className="flex flex-wrap gap-2">
            {PAGINAS.map((pagina) => (
              <Link
                key={pagina.href}
                href={pagina.href}
                className="tap-target inline-flex items-center rounded-lg border border-line bg-panel-high px-4 text-[13px] uppercase tracking-[0.14em] text-ink transition-colors hover:border-creme/25"
              >
                {pagina.label}
              </Link>
            ))}
          </nav>
        </div>
      </main>

      <SiteFooter familyName={settings.familyName} />
    </>
  );
}
