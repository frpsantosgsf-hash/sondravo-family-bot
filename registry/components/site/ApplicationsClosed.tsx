'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wordmark } from '@/components/site/Wordmark';

const SECONDEN = 5;

/**
 * Wat een bezoeker ziet wanneer de sollicitaties dicht staan.
 *
 * Na een paar tellen gaat hij vanzelf terug naar de voorpagina. De teller
 * staat erbij, zodat het niet aanvoelt alsof de site hem wegduwt — en er is
 * een knop, zodat wie niet wil wachten niet hoeft te wachten.
 */
export function ApplicationsClosed({ familyName }: { familyName: string }) {
  const router = useRouter();
  const [resterend, setResterend] = useState(SECONDEN);

  useEffect(() => {
    const tik = window.setInterval(() => {
      setResterend((waarde) => (waarde > 0 ? waarde - 1 : 0));
    }, 1000);

    const terug = window.setTimeout(() => router.push('/'), SECONDEN * 1000);

    return () => {
      window.clearInterval(tik);
      window.clearTimeout(terug);
    };
  }, [router]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-panel px-6 py-10 text-center sm:px-10 sm:py-14">
      {/* Zachte gloed achter het logo, zoals op de voorpagina. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-72 w-[30rem] max-w-none -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(241,232,207,0.08),transparent)] blur-2xl"
      />

      <div className="relative flex flex-col items-center">
        <div className="animate-fade-up w-full max-w-[220px] sm:max-w-[260px]">
          <Wordmark variant="stacked" priority className="mx-auto" />
        </div>

        <p
          className="animate-fade-up mt-8 text-[11px] font-medium uppercase tracking-[0.22em] text-muted"
          style={{ animationDelay: '0.15s' }}
        >
          {familyName}
        </p>

        <h1
          className="animate-fade-up mt-3 font-display text-2xl uppercase tracking-[0.1em] text-creme sm:text-3xl"
          style={{ animationDelay: '0.25s' }}
        >
          Sollicitaties gesloten
        </h1>

        <p
          className="animate-fade-up mt-4 max-w-sm text-[15px] leading-relaxed text-pretty text-muted"
          style={{ animationDelay: '0.35s' }}
        >
          De familie zit vol. We nemen op dit moment geen nieuwe aanmeldingen aan — houd onze
          Discord in de gaten, daar laten we het weten zodra de deur weer opengaat.
        </p>

        <div
          className="animate-fade-up mt-8 flex flex-col items-center gap-3"
          style={{ animationDelay: '0.45s' }}
        >
          <button
            type="button"
            onClick={() => router.push('/')}
            className="tap-target inline-flex items-center justify-center gap-2 rounded-lg bg-creme px-6 text-sm font-semibold uppercase tracking-[0.14em] text-void transition-colors hover:bg-white"
          >
            Terug naar de voorpagina
          </button>

          <p aria-live="polite" className="text-xs text-muted-soft">
            {resterend > 0
              ? `Je gaat automatisch terug over ${resterend} ${resterend === 1 ? 'seconde' : 'seconden'}.`
              : 'Bezig met terugsturen…'}
          </p>
        </div>
      </div>
    </div>
  );
}
