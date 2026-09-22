'use client';

import { useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import type { ClipHandle } from '@/components/site/clip-handle';

interface FileClipLayerProps {
  src: string;
  poster: string;
  ref: RefObject<ClipHandle | null>;
  onReady: () => void;
  onUnavailable: () => void;
}

/** Dezelfde besturing als de YouTube-laag, maar voor een bestand in /public. */
export function FileClipLayer({ src, poster, ref, onReady, onUnavailable }: FileClipLayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  /**
   * Het element wordt server-side meegestuurd, dus de browser kan de metadata
   * al binnen hebben voordat React de listeners koppelt. Dan is het
   * loadedmetadata-event al voorbij en moeten we de huidige stand uitlezen.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      onReady();
      return;
    }
    if (video.error) {
      onUnavailable();
      return;
    }

    const handleReady = () => onReady();
    const handleError = () => onUnavailable();

    video.addEventListener('loadedmetadata', handleReady);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleReady);
      video.removeEventListener('error', handleError);
    };
  }, [onReady, onUnavailable]);

  useImperativeHandle(ref, () => ({
    play(fromSeconds: number) {
      const video = videoRef.current;
      if (!video) return;
      try {
        video.currentTime = fromSeconds;
      } catch {
        // Kan gebeuren voordat de metadata geladen is; volgende ronde lukt het wel.
      }
      void video.play().catch(() => undefined);
    },
    pause() {
      videoRef.current?.pause();
    },
    setMuted(muted: boolean) {
      const video = videoRef.current;
      if (video) video.muted = muted;
    },
  }));

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      muted
      playsInline
      preload="auto"
      className="absolute inset-0 h-full w-full object-cover"
      aria-hidden
    />
  );
}
