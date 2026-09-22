import Link from 'next/link';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { HeroStage } from '@/components/site/HeroStage';
import { CapacityMeter } from '@/components/site/CapacityMeter';
import { getRegistryData } from '@/lib/data';
import { getViewerAccess, mayViewRegistry } from '@/lib/access';
import { resolveHeroTiming, resolveHeroVideo } from '@/lib/video';

export const dynamic = 'force-dynamic';

/** Onze intro-clip. Overschrijfbaar met NEXT_PUBLIC_HERO_VIDEO_URL. */
const HERO_VIDEO_SRC =
  process.env.NEXT_PUBLIC_HERO_VIDEO_URL || 'https://www.youtube.com/watch?v=Yeo4TWyC1wo';

export default async function HomePage() {
  const [access, registry] = await Promise.all([getViewerAccess(), getRegistryData()]);
  const { members, ranks, settings, viewer, configError } = registry;
  const source = resolveHeroVideo(HERO_VIDEO_SRC);
  const timing = resolveHeroTiming();

  // De lijst is besloten, dus de tellers ook: voor een buitenstaander komt er
  // toch niets uit de database en dan staat er alleen maar een hoop nul.
  const toonCijfers = mayViewRegistry(access);
  const total = members.length;
  const occupiedRanks = new Set(members.map((member) => member.rank)).size;

  return (
    <>
      <SiteNav viewer={viewer} current="/" showRegistry={toonCijfers} />

      <main id="hoofdinhoud">
        {/* ---------------------------------------------------------------- */}
        {/* Intro: logo, dan een stukje van onze clip, dan weer het logo      */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative overflow-hidden px-4 pb-10 pt-8 sm:px-6 sm:pb-14 sm:pt-12">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[26rem] w-[40rem] max-w-none -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(241,232,207,0.07),transparent)] blur-2xl"
          />

          <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
            {/* Het logo draagt de naam al; de h1 blijft er voor schermlezers
                en zoekmachines, maar wordt niet dubbel getoond. */}
            <h1 className="sr-only">The Sondravo Family — Official Family Registry</h1>

            <HeroStage source={source} timing={timing} poster="/media/poster.png" />

            <p className="eyebrow animate-fade-up mt-8" style={{ animationDelay: '0.7s' }}>
              Official Family Registry
            </p>

            <p
              className="animate-fade-up mt-3 max-w-md text-[15px] leading-relaxed text-pretty text-muted"
              style={{ animationDelay: '0.8s' }}
            >
              {toonCijfers
                ? 'Eén familie, één lijst. Bekijk de ledenlijst of stem mee over wie erbij komt.'
                : access.signedIn
                  ? 'Eén familie, één lijst. De ledenlijst is besloten — denk je dat je erbij hoort, solliciteer dan.'
                  : 'Eén familie, één lijst. Ben je al lid? Log in met Discord. Zo niet, dan kun je solliciteren.'}
            </p>

            <div
              className="animate-fade-up mt-7 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row"
              style={{ animationDelay: '0.9s' }}
            >
              <Link
                href={toonCijfers ? '/leden' : '/solliciteren'}
                className="tap-target inline-flex w-full items-center justify-center gap-2 rounded-lg bg-creme px-6 text-sm font-semibold uppercase tracking-[0.14em] text-void shadow-[0_14px_40px_-18px_rgba(241,232,207,0.7)] transition-all duration-150 hover:bg-white sm:w-auto"
              >
                {toonCijfers ? 'Ledenlijst bekijken' : 'Solliciteren'}
                <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 10h11m0 0l-4-4m4 4l-4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>

              {/* Voor leden is stemmen de reden dat ze hier komen, dus die
                  knop staat naast de ledenlijst. Op een telefoon is dit de
                  enige route: de links in de balk bovenaan zijn daar te smal
                  voor en blijven verborgen. */}
              {toonCijfers ? (
                <Link
                  href="/sollicitaties"
                  className="tap-target inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel-high px-6 text-sm uppercase tracking-[0.14em] text-ink transition-all duration-150 hover:border-creme/25 hover:bg-panel-hover sm:w-auto"
                >
                  Sollicitaties
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 6.5l2 2 3.5-3.5" />
                    <path d="M12 6.5h4M12 13.5h4" />
                    <path d="M4.5 12.5l3 3M7.5 12.5l-3 3" />
                  </svg>
                </Link>
              ) : source.kind === 'youtube' ? (
                <a
                  href={source.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-target inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel-high px-6 text-sm uppercase tracking-[0.14em] text-ink transition-all duration-150 hover:border-creme/25 hover:bg-panel-hover sm:w-auto"
                >
                  Hele intro
                  <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M7 4h9v9M16 4L6 14M4 8v8h8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="sr-only">(opent op YouTube)</span>
                </a>
              ) : null}
            </div>

            {toonCijfers ? (
              <div className="animate-fade-up mt-9 flex justify-center" style={{ animationDelay: '1s' }}>
                <CapacityMeter total={total} limit={settings.memberLimit} variant="hero" />
              </div>
            ) : null}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Cijfers                                                           */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-label="De familie in cijfers"
          className={`mx-auto mt-4 max-w-4xl px-4 sm:px-6 ${toonCijfers ? '' : 'hidden'}`}
        >
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Leden" value={configError ? '—' : String(total)} />
            <Stat label="Capaciteit" value={String(settings.memberLimit)} />
            <Stat
              label="Vrije plekken"
              value={configError ? '—' : String(Math.max(0, settings.memberLimit - total))}
            />
            <Stat label="Rangen bezet" value={configError ? '—' : `${occupiedRanks} / ${ranks.length}`} />
          </dl>
        </section>

        {configError ? (
          <div className="mx-auto mt-8 max-w-4xl px-4 sm:px-6">
            <p
              role="status"
              className="rounded-lg border border-sondravo-red/35 bg-sondravo-red/10 px-4 py-3 text-sm leading-relaxed text-[#f2a9ac]"
            >
              {configError}
            </p>
          </div>
        ) : null}
      </main>

      <SiteFooter familyName={settings.familyName} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel panel-sheen px-4 py-4 text-center">
      <dt className="text-[10px] uppercase tracking-[0.22em] text-muted">{label}</dt>
      <dd className="mt-1.5 font-display text-2xl font-semibold tracking-wide text-creme">{value}</dd>
    </div>
  );
}
