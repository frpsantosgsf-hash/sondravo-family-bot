/**
 * De clip op de voorpagina mag een YouTube-link zijn of een eigen bestand in
 * /public. Deze helper bepaalt welk van de twee het is.
 */

export type HeroVideo =
  | { kind: 'youtube'; id: string; embedUrl: string; watchUrl: string; thumbnailUrl: string }
  | { kind: 'file'; src: string };

/** Timing van de intro-lus op de voorpagina. */
export interface HeroTiming {
  /** Hoe lang het logo in beeld blijft, in milliseconden. */
  logoMs: number;
  /** Hoe lang het fragment uit de clip speelt, in milliseconden. */
  clipMs: number;
  /** Op welke seconde in de clip het fragment begint. */
  startSeconds: number;
  /**
   * Meet het fragment vanaf het eind van de clip in plaats van vanaf
   * startSeconds. Zo speelt de voorpagina de laatste seconden af zonder dat
   * de lengte van de video ergens hard ingetypt staat.
   */
  fromEnd: boolean;
}

function readSeconds(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function readFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return !['0', 'false', 'nee', 'off'].includes(value.trim().toLowerCase());
}

/**
 * De lus: logo in beeld, dan een kort fragment uit de clip, dan weer het logo.
 * Alle drie de waarden zijn met environment variables aan te passen zonder
 * dat er code in hoeft.
 */
export function resolveHeroTiming(): HeroTiming {
  return {
    logoMs: readSeconds(process.env.NEXT_PUBLIC_HERO_LOGO_SECONDS, 3.5) * 1000,
    clipMs: readSeconds(process.env.NEXT_PUBLIC_HERO_CLIP_SECONDS, 15) * 1000,
    startSeconds: readSeconds(process.env.NEXT_PUBLIC_HERO_CLIP_START, 0),
    fromEnd: readFlag(process.env.NEXT_PUBLIC_HERO_CLIP_FROM_END, true),
  };
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

function extractYouTubeId(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;

  // youtu.be/<id>
  if (url.hostname.endsWith('youtu.be')) {
    const id = url.pathname.slice(1).split('/')[0] ?? '';
    return ID_PATTERN.test(id) ? id : null;
  }

  // youtube.com/watch?v=<id>
  const queryId = url.searchParams.get('v');
  if (queryId && ID_PATTERN.test(queryId)) return queryId;

  // youtube.com/embed/<id>, /shorts/<id>, /live/<id>
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(segments[0] ?? '')) {
    const id = segments[1] ?? '';
    return ID_PATTERN.test(id) ? id : null;
  }

  return null;
}

export function resolveHeroVideo(value: string): HeroVideo {
  const id = extractYouTubeId(value.trim());

  if (id) {
    return {
      kind: 'youtube',
      id,
      // nocookie-domein: geen tracking-cookies voordat iemand echt kijkt.
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    };
  }

  return { kind: 'file', src: value };
}
