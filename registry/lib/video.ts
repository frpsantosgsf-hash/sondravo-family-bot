/**
 * De clip op de voorpagina mag een YouTube-link zijn of een eigen bestand in
 * /public. Deze helper bepaalt welk van de twee het is.
 */

export type HeroVideo =
  | { kind: 'youtube'; id: string; embedUrl: string; thumbnailUrl: string }
  | { kind: 'file'; src: string };

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
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      loop: '1',
      playlist: id, // loop werkt alleen met een playlist van zichzelf
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
    });

    return {
      kind: 'youtube',
      id,
      // nocookie-domein: geen tracking-cookies voordat iemand echt kijkt.
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    };
  }

  return { kind: 'file', src: value };
}
