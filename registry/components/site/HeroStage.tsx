'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { YouTubeClipLayer } from '@/components/site/YouTubeClipLayer';
import { FileClipLayer } from '@/components/site/FileClipLayer';
import type { ClipHandle } from '@/components/site/clip-handle';
import type { HeroTiming, HeroVideo } from '@/lib/video';

interface HeroStageProps {
  source: HeroVideo;
  timing: HeroTiming;
  poster: string;
}

type Phase = 'logo' | 'clip';

const STORAGE_KEY = 'sondravo:intro';
const PREFERENCE_EVENT = 'sondravo:intro-change';

/* --------------------------------------------------------------------------
   Of de intro vanzelf mag spelen is geen React-state maar een voorkeur van de
   bezoeker: opgeslagen keuze, en anders de systeeminstelling voor beweging.
   useSyncExternalStore leest die veilig, ook bij server-rendering.
   -------------------------------------------------------------------------- */

function subscribeToPreference(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', onChange);
  window.addEventListener('storage', onChange);
  window.addEventListener(PREFERENCE_EVENT, onChange);

  return () => {
    media.removeEventListener('change', onChange);
    window.removeEventListener('storage', onChange);
    window.removeEventListener(PREFERENCE_EVENT, onChange);
  };
}

function readPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'off') return false;
    if (stored === 'on') return true;
  } catch {
    // Privémodus of geblokkeerde opslag: dan de systeeminstelling.
  }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Tijdens server-rendering gaan we uit van "aan"; de client corrigeert dat. */
function readServerPreference(): boolean {
  return true;
}

function writePreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Niet kunnen onthouden is geen reden om de knop te laten falen.
  }
  window.dispatchEvent(new Event(PREFERENCE_EVENT));
}

/**
 * De intro op de voorpagina.
 *
 * Het logo komt rustig in beeld en blijft een paar tellen staan, daarna vloeit
 * een kort fragment uit onze clip erin, en daarna is het logo er weer. Die lus
 * blijft draaien tot iemand hem stopt.
 *
 * Bezoekers houden de controle: de lus is te pauzeren (het logo blijft dan
 * staan), het geluid staat standaard uit, en wie "verminderde beweging" in zijn
 * systeem heeft aanstaan krijgt de lus helemaal niet vanzelf te zien.
 */
export function HeroStage({ source, timing, poster }: HeroStageProps) {
  const clipRef = useRef<ClipHandle | null>(null);

  const [phase, setPhase] = useState<Phase>('logo');
  const [clipReady, setClipReady] = useState(false);
  const [clipBroken, setClipBroken] = useState(false);
  const [muted, setMuted] = useState(true);

  const running = useSyncExternalStore(
    subscribeToPreference,
    readPreference,
    readServerPreference,
  );

  const toggleRunning = useCallback(() => {
    const next = !readPreference();
    // Stoppen brengt het logo terug; dat is het rustpunt van de intro.
    if (!next) setPhase('logo');
    writePreference(next);
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      clipRef.current?.setMuted(next);
      return next;
    });
  }, []);

  /* --- De lus: logo -> fragment -> logo ---------------------------------- */
  const active = running && clipReady && !clipBroken;

  useEffect(() => {
    if (!active) return;

    const duration = phase === 'logo' ? timing.logoMs : timing.clipMs;
    const timer = window.setTimeout(() => {
      setPhase((current) => (current === 'logo' ? 'clip' : 'logo'));
    }, duration);

    return () => window.clearTimeout(timer);
  }, [active, phase, timing.logoMs, timing.clipMs]);

  /* --- De speler volgt de fase ------------------------------------------ */
  useEffect(() => {
    const clip = clipRef.current;
    if (!clip || !clipReady) return;

    if (active && phase === 'clip') {
      clip.play(timing.startSeconds);
    } else {
      clip.pause();
    }
  }, [active, phase, clipReady, timing.startSeconds]);

  const showingClip = active && phase === 'clip';
  const clipAvailable = clipReady && !clipBroken;

  const handleReady = useCallback(() => setClipReady(true), []);
  const handleUnavailable = useCallback(() => setClipBroken(true), []);

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div className="panel-sheen relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-line bg-void sm:aspect-video">
        {/* ---------- Laag 1: het fragment ---------- */}
        <div
          className={`absolute inset-0 transition-opacity duration-[1400ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
            showingClip ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden={!showingClip}
        >
          {/* Trage inzoom over de hele duur van het fragment. Aparte laag,
              zodat de zoom losstaat van het in- en uitvloeien. */}
          <div
            className="absolute inset-0 will-change-transform"
            style={{
              transform: showingClip ? 'scale(1.09)' : 'scale(1)',
              transitionProperty: 'transform',
              transitionTimingFunction: 'linear',
              transitionDuration: showingClip ? `${timing.clipMs + 1600}ms` : '0ms',
              // Terugzetten pas nadat het beeld is weggevloeid, anders zie je springen.
              transitionDelay: showingClip ? '0ms' : '1400ms',
              // Lichte gradatie: iets meer diepte, iets minder videolook.
              filter: 'contrast(1.07) saturate(1.06) brightness(0.97)',
            }}
          >
            {clipBroken ? null : source.kind === 'youtube' ? (
              <YouTubeClipLayer
                videoId={source.id}
                startSeconds={timing.startSeconds}
                ref={clipRef}
                onReady={handleReady}
                onUnavailable={handleUnavailable}
              />
            ) : (
              <FileClipLayer
                src={source.src}
                poster={poster}
                ref={clipRef}
                onReady={handleReady}
                onUnavailable={handleUnavailable}
              />
            )}
          </div>

          {/* Donkere rand rondom het beeld, zodat het fragment in de pagina
              zakt in plaats van er als een venster bovenop te liggen. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 shadow-[inset_0_0_150px_70px_rgba(6,7,6,0.97)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_28%,rgba(6,7,6,0.55)_72%,rgba(6,7,6,0.92)_100%)]"
          />

          {/* Filmkorrel over het beeld. */}
          <div aria-hidden className="film-grain pointer-events-none absolute inset-0 overflow-hidden" />
        </div>

        {/* ---------- Letterbox ----------
            Twee zwarte balken die tijdens het fragment inschuiven. Dat geeft
            het brede, filmische kader; bij het logo trekken ze weer weg. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-void transition-[height] duration-[1400ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ height: showingClip ? '8.5%' : '0%' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-void transition-[height] duration-[1400ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ height: showingClip ? '8.5%' : '0%' }}
        />

        {/* ---------- Laag 2: het logo ---------- */}
        <div
          className={`absolute inset-0 flex items-center justify-center px-8 transition-all duration-[1400ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
            showingClip ? 'pointer-events-none scale-[0.96] opacity-0' : 'scale-100 opacity-100'
          }`}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute h-3/4 w-3/4 rounded-full bg-[radial-gradient(closest-side,rgba(241,232,207,0.10),transparent)] blur-2xl"
          />
          <Image
            src="/logo.png"
            alt="The Sondravo Family"
            width={900}
            height={906}
            priority
            sizes="(max-width: 640px) 78vw, 440px"
            className="animate-mark-in relative w-[78%] max-w-[440px] drop-shadow-[0_24px_60px_rgba(0,0,0,0.7)]"
            style={{ animation: 'mark-in 1.8s cubic-bezier(0.16,1,0.3,1) both, drift 14s ease-in-out 1.8s infinite alternate' }}
          />
        </div>

        {/* ---------- Bediening ---------- */}
        {clipAvailable ? (
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-end gap-2 p-3 sm:p-4">
            {showingClip ? (
              <button
                type="button"
                onClick={toggleMuted}
                aria-pressed={!muted}
                className="tap-target inline-flex items-center gap-2 rounded-lg border border-line/80 bg-void/70 px-3 text-[13px] text-ink backdrop-blur transition-colors hover:border-creme/30 hover:bg-void/90"
              >
                {muted ? <MutedIcon /> : <SoundIcon />}
                <span className="hidden sm:inline">{muted ? 'Geluid aan' : 'Geluid uit'}</span>
                <span className="sr-only sm:hidden">{muted ? 'Geluid aan' : 'Geluid uit'}</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={toggleRunning}
              aria-pressed={running}
              className="tap-target inline-flex items-center gap-2 rounded-lg border border-line/80 bg-void/70 px-3 text-[13px] text-ink backdrop-blur transition-colors hover:border-creme/30 hover:bg-void/90"
            >
              {running ? <PauseIcon /> : <PlayIcon />}
              <span className="hidden sm:inline">{running ? 'Intro pauzeren' : 'Intro afspelen'}</span>
              <span className="sr-only sm:hidden">
                {running ? 'Intro pauzeren' : 'Intro afspelen'}
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 shrink-0" fill="currentColor">
      <rect x="5" y="4" width="3.5" height="12" rx="1" />
      <rect x="11.5" y="4" width="3.5" height="12" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 shrink-0" fill="currentColor">
      <path d="M6 4.5l10 5.5-10 5.5z" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 8v4h3l4 3V5L7 8H4z" strokeLinejoin="round" />
      <path d="M14 8l4 4m0-4l-4 4" strokeLinecap="round" />
    </svg>
  );
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 8v4h3l4 3V5L7 8H4z" strokeLinejoin="round" />
      <path d="M14 7.5a3.5 3.5 0 0 1 0 5M16.5 5.5a6.5 6.5 0 0 1 0 9" strokeLinecap="round" />
    </svg>
  );
}
