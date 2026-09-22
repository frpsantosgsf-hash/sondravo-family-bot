'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { HeroVideo as HeroVideoSource } from '@/lib/video';

interface HeroVideoProps {
  source: HeroVideoSource;
  /** Eigen poster, gebruikt wanneer de clip een bestand is of de thumbnail faalt. */
  poster: string;
}

/**
 * De intro-clip van de familie.
 *
 * Werkt met een YouTube-link én met een eigen bestand in /public. In beide
 * gevallen begint hij pas te spelen zodra hij in beeld komt — dat houdt de
 * voorpagina licht en voorkomt geluid dat je niet verwacht.
 */
export function HeroVideo({ source, poster }: HeroVideoProps) {
  if (source.kind === 'youtube') {
    return <YouTubeClip source={source} poster={poster} />;
  }
  return <FileClip src={source.src} poster={poster} />;
}

/* -------------------------------------------------------------------------- */
/* YouTube                                                                     */
/* -------------------------------------------------------------------------- */

function YouTubeClip({
  source,
  poster,
}: {
  source: Extract<HeroVideoSource, { kind: 'youtube' }>;
  poster: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    const element = frameRef.current;
    if (!element || active) return;

    // Met "minder beweging" aan blijft de plaat staan tot iemand zelf klikt.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [active]);

  return (
    <figure ref={frameRef} className="panel panel-sheen relative aspect-video w-full overflow-hidden">
      {active ? (
        <iframe
          src={source.embedUrl}
          title="Intro van The Sondravo Family"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setActive(true)}
          className="group absolute inset-0 flex items-center justify-center"
          aria-label="Intro-clip afspelen"
        >
          <Image
            src={thumbFailed ? poster : source.thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 900px"
            onError={() => setThumbFailed(true)}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            unoptimized={!thumbFailed}
          />
          <span aria-hidden className="absolute inset-0 bg-void/45 transition-colors group-hover:bg-void/30" />
          <span
            aria-hidden
            className="relative flex h-16 w-16 items-center justify-center rounded-full border border-creme/25 bg-void/70 text-creme backdrop-blur transition-all duration-200 group-hover:scale-105 group-hover:border-creme/45 group-hover:bg-void/85"
          >
            <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6" fill="currentColor">
              <path d="M7 5l12 7-12 7z" />
            </svg>
          </span>
        </button>
      )}
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Eigen bestand in /public                                                    */
/* -------------------------------------------------------------------------- */

function FileClip({ src, poster }: { src: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [available, setAvailable] = useState(true);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void video.play().catch(() => {
              /* Autoplay geweigerd: de bezoeker drukt zelf op afspelen. */
            });
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  function toggleSound() {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setMuted(next);
    if (!next) void video.play().catch(() => undefined);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  if (!available) {
    return (
      <figure className="panel panel-sheen relative aspect-video w-full overflow-hidden">
        <Image
          src={poster}
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 900px"
          className="object-cover opacity-45"
        />
        <figcaption className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-void/55 px-6 text-center">
          <span className="eyebrow">Clip volgt</span>
          <p className="max-w-xs text-sm leading-relaxed text-pretty text-muted">
            Zet de clip neer als{' '}
            <code className="rounded bg-panel-high px-1.5 py-0.5 text-[12px] text-creme/85">
              public/media/sondravo.mp4
            </code>{' '}
            of vul NEXT_PUBLIC_HERO_VIDEO_URL met een YouTube-link.
          </p>
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="panel panel-sheen group relative aspect-video w-full overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
        onError={() => setAvailable(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="h-full w-full object-cover"
        aria-label="Intro-clip van The Sondravo Family"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void/70 via-transparent to-void/25"
      />

      <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-3 sm:p-4">
        <button
          type="button"
          onClick={togglePlay}
          className="tap-target inline-flex items-center gap-2 rounded-lg border border-line/80 bg-void/70 px-3 text-[13px] text-ink backdrop-blur transition-colors hover:border-creme/30 hover:bg-void/90"
        >
          {playing ? (
            <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5" fill="currentColor">
              <rect x="5" y="4" width="3.5" height="12" rx="1" />
              <rect x="11.5" y="4" width="3.5" height="12" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5" fill="currentColor">
              <path d="M6 4.5l10 5.5-10 5.5z" />
            </svg>
          )}
          {playing ? 'Pauze' : 'Afspelen'}
        </button>

        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={!muted}
          className="tap-target inline-flex items-center gap-2 rounded-lg border border-line/80 bg-void/70 px-3 text-[13px] text-ink backdrop-blur transition-colors hover:border-creme/30 hover:bg-void/90"
        >
          {muted ? (
            <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 8v4h3l4 3V5L7 8H4z" strokeLinejoin="round" />
              <path d="M14 8l4 4m0-4l-4 4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 8v4h3l4 3V5L7 8H4z" strokeLinejoin="round" />
              <path d="M14 7.5a3.5 3.5 0 0 1 0 5M16.5 5.5a6.5 6.5 0 0 1 0 9" strokeLinecap="round" />
            </svg>
          )}
          {muted ? 'Geluid aan' : 'Geluid uit'}
        </button>
      </figcaption>
    </figure>
  );
}
