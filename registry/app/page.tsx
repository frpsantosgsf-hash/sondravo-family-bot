import Link from 'next/link';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { Wordmark } from '@/components/site/Wordmark';
import { HeroVideo } from '@/components/site/HeroVideo';
import { CapacityMeter } from '@/components/site/CapacityMeter';
import { getRegistryData } from '@/lib/data';
import { resolveHeroVideo } from '@/lib/video';

export const dynamic = 'force-dynamic';

/** Onze intro-clip. Overschrijfbaar met NEXT_PUBLIC_HERO_VIDEO_URL. */
const HERO_VIDEO_SRC =
  process.env.NEXT_PUBLIC_HERO_VIDEO_URL || 'https://www.youtube.com/watch?v=Yeo4TWyC1wo';

export default async function HomePage() {
  const { members, ranks, settings, viewer, configError } = await getRegistryData();

  const total = members.length;
  const occupiedRanks = new Set(members.map((member) => member.rank)).size;

  return (
    <>
      <SiteNav viewer={viewer} current="/" />

      <main id="hoofdinhoud">
        {/* ---------------------------------------------------------------- */}
        {/* Hero — het logo komt rustig in beeld, daarna de rest              */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative overflow-hidden px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
          {/* Zachte gloed achter het logo, nooit hard genoeg om op te vallen */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[26rem] w-[40rem] max-w-none -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(241,232,207,0.09),transparent)] blur-2xl"
          />

          <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
            {/* Het logo draagt de naam al; de h1 blijft er voor schermlezers
                en zoekmachines, maar wordt niet dubbel getoond. */}
            <h1 className="sr-only">The Sondravo Family — Official Family Registry</h1>

            <div className="animate-mark-in w-full">
              <Wordmark variant="stacked" priority className="mx-auto" />
            </div>

            <p
              className="eyebrow animate-fade-up mt-8"
              style={{ animationDelay: '0.75s' }}
            >
              Official Family Registry
            </p>

            <p
              className="animate-fade-up mt-4 max-w-md text-[15px] leading-relaxed text-pretty text-muted"
              style={{ animationDelay: '0.85s' }}
            >
              Eén familie, één lijst. Bekijk onze intro hieronder — en in de ledenlijst
              zie je iedereen netjes op rang.
            </p>

            <div
              className="animate-fade-up mt-8 flex flex-col items-center gap-4 sm:flex-row"
              style={{ animationDelay: '1.05s' }}
            >
              <Link
                href="/leden"
                className="tap-target inline-flex w-full items-center justify-center gap-2 rounded-lg bg-creme px-6 text-sm font-semibold uppercase tracking-[0.14em] text-void shadow-[0_14px_40px_-18px_rgba(241,232,207,0.7)] transition-all duration-150 hover:bg-white sm:w-auto"
              >
                Ledenlijst bekijken
                <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 10h11m0 0l-4-4m4 4l-4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>

              <a
                href="#clip"
                className="tap-target inline-flex w-full items-center justify-center rounded-lg border border-line bg-panel-high px-6 text-sm uppercase tracking-[0.14em] text-ink transition-all duration-150 hover:border-creme/25 hover:bg-panel-hover sm:w-auto"
              >
                Onze clip
              </a>
            </div>

            <div
              className="animate-fade-up mt-10 flex justify-center"
              style={{ animationDelay: '1.15s' }}
            >
              <CapacityMeter total={total} limit={settings.memberLimit} variant="hero" />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* De clip                                                           */}
        {/* ---------------------------------------------------------------- */}
        <section
          id="clip"
          aria-labelledby="clip-titel"
          className="animate-fade-up mx-auto max-w-4xl scroll-mt-20 px-4 sm:px-6"
          style={{ animationDelay: '1.25s' }}
        >
          <div className="mb-4 flex items-center gap-3">
            <h2 id="clip-titel" className="eyebrow">
              Onze intro
            </h2>
            <div className="hairline flex-1" />
          </div>
          <HeroVideo source={resolveHeroVideo(HERO_VIDEO_SRC)} poster="/media/poster.png" />
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Cijfers                                                           */}
        {/* ---------------------------------------------------------------- */}
        <section aria-label="De familie in cijfers" className="mx-auto mt-12 max-w-4xl px-4 sm:px-6">
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
