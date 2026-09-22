'use client';

import { useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import type { ClipHandle } from '@/components/site/clip-handle';

/* --- Minimale typing voor de stukjes YouTube-API die we echt gebruiken --- */
interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  setVolume(volume: number): void;
  destroy(): void;
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: { onReady?: () => void; onError?: () => void };
    },
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT_ID = 'youtube-iframe-api';

/** Laadt de YouTube IFrame API één keer per pagina. */
function loadYouTubeApi(): Promise<YouTubeNamespace> {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('YouTube API kon niet laden'));
      document.head.appendChild(script);
    }

    // De API roept deze globale callback aan zodra hij klaar is. Pollen vangt
    // het geval af dat het script al geladen was door iets anders.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };

    const interval = window.setInterval(() => {
      if (window.YT?.Player) {
        window.clearInterval(interval);
        resolve(window.YT);
      }
    }, 120);

    window.setTimeout(() => {
      window.clearInterval(interval);
      if (!window.YT?.Player) reject(new Error('YouTube API reageerde niet'));
    }, 12000);
  });
}

interface YouTubeClipLayerProps {
  videoId: string;
  startSeconds: number;
  ref: RefObject<ClipHandle | null>;
  onReady: () => void;
  onUnavailable: () => void;
}

export function YouTubeClipLayer({
  videoId,
  startSeconds,
  ref,
  onReady,
  onUnavailable,
}: YouTubeClipLayerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);

  useImperativeHandle(ref, () => ({
    play(fromSeconds: number) {
      const player = playerRef.current;
      if (!player) return;
      player.seekTo(fromSeconds, true);
      player.playVideo();
    },
    pause() {
      playerRef.current?.pauseVideo();
    },
    setMuted(muted: boolean) {
      const player = playerRef.current;
      if (!player) return;
      if (muted) {
        player.mute();
      } else {
        player.unMute();
        player.setVolume(70);
      }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    const mount = mountRef.current;
    if (!mount) return;

    void loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mountRef.current) return;

        playerRef.current = new YT.Player(mountRef.current, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            iv_load_policy: 3,
            start: Math.floor(startSeconds),
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              playerRef.current?.mute();
              onReady();
            },
            onError: () => {
              if (!cancelled) onUnavailable();
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) onUnavailable();
      });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        // De speler was al opgeruimd; niets aan de hand.
      }
      playerRef.current = null;
    };
    // videoId en startSeconds komen uit de config en wijzigen niet tijdens een sessie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* De speler wordt groter gemaakt dan het kader, zodat de zwarte balken
          van YouTube buiten beeld vallen en het beeld het vlak vult. */}
      <div className="absolute left-1/2 top-1/2 h-[135%] w-[135%] -translate-x-1/2 -translate-y-1/2">
        <div ref={mountRef} className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full" />
      </div>
    </div>
  );
}
