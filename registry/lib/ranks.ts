import type { CSSProperties } from 'react';
import type { Rank } from '@/types';

/**
 * De rangladder van The Sondravo Family, hoog naar laag.
 *
 * De database (`public.ranks`) is de bron van waarheid voor volgorde én kleur.
 * Deze lijst is de fallback wanneer de tabel nog leeg is. De volgorde wordt
 * NOOIT alfabetisch gesorteerd.
 *
 * De kleuren komen één op één van de Discord-rollen.
 */
export const RANK_LADDER: Rank[] = [
  { key: 'mpitarika', label: 'Mpitarika', glyph: '♛', tone: 'gold', color: '#1e00ff', sortOrder: 1 },
  { key: 'lefitra', label: 'Lefitra', glyph: '✦', tone: 'red', color: '#b7ff00', sortOrder: 2 },
  { key: 'mpanoro', label: 'Mpanoro', glyph: '✦', tone: 'red', color: '#00f52d', sortOrder: 3 },
  { key: 'mpifehy', label: 'Mpifehy', glyph: '✦', tone: 'red', color: '#00f52d', sortOrder: 4 },
  { key: 'hery', label: 'Hery', glyph: '◆', tone: 'green', color: '#2ecc71', sortOrder: 5 },
  { key: 'mpiady', label: 'Mpiady', glyph: '◆', tone: 'green', color: '#ddf80c', sortOrder: 6 },
  { key: 'zoky', label: 'Zoky', glyph: '◈', tone: 'stone', color: '#f1c40f', sortOrder: 7 },
  { key: 'mpikambana', label: 'Mpikambana', glyph: '●', tone: 'neutral', color: '#ff0000', sortOrder: 8 },
  { key: 'zazavao', label: 'Zazavao', glyph: '○', tone: 'muted', color: '#ff0000', sortOrder: 9 },
];

export const DEFAULT_RANK_KEY = 'zazavao';

/** Terugval wanneer een rang om wat voor reden dan ook geen kleur heeft. */
const FALLBACK_COLOR = '#8b8f8a';

export function sortRanks(ranks: Rank[]): Rank[] {
  return [...ranks].sort((a, b) => a.sortOrder - b.sortOrder);
}

export interface RankAccent {
  /** Rangkop boven een groep. */
  heading: CSSProperties;
  /** Badge op de ledenrij. */
  badge: CSSProperties;
  /** Dun accentlijntje naast de rangkop. */
  rule: CSSProperties;
  /** Randje rond de avatar. */
  ring: CSSProperties;
}

function safeColor(color: string | undefined): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : FALLBACK_COLOR;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: l * 100 };

  const s = delta / (1 - Math.abs(2 * l - 1));

  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h = h * 60;
  if (h < 0) h += 360;

  return { h, s: s * 100, l: l * 100 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Maakt van een felle rolkleur een variant die op zwart leesbaar is.
 *
 * De kleurtoon blijft staan — dat is wat de rang herkenbaar maakt — maar
 * verzadiging en helderheid worden binnen een vaste marge getrokken. Zonder
 * die stap zou het blauw van Mpitarika (bijna zwart van zichzelf) veel donkerder
 * ogen dan het goud van Zoky, en zou de lijst ongelijk aanvoelen.
 */
function tuned(hsl: Hsl, maxSaturation: number, minLight: number, maxLight: number, alpha = 1): string {
  const s = Math.round(Math.min(hsl.s, maxSaturation));
  const l = Math.round(clamp(hsl.l, minLight, maxLight));
  const h = Math.round(hsl.h);
  return alpha === 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${alpha})`;
}

/**
 * Zet een Discord-rolkleur om in accenten die op een zwarte pagina werken.
 *
 * De rolkleuren zijn fel — puur blauw, puur rood, neon lime. Die felheid gaat
 * er hier grotendeels af: tekst wordt zachter en lichter, vlakken en randen
 * krijgen veel transparantie mee. Zo blijft de rang herkenbaar zonder dat de
 * lijst een kleurenfestival wordt.
 */
export function rankAccent(color: string): RankAccent {
  const hsl = hexToHsl(safeColor(color));

  const headingColor = tuned(hsl, 52, 64, 84);
  const badgeText = tuned(hsl, 46, 68, 86);
  const border = tuned(hsl, 58, 46, 64, 0.4);
  const surface = tuned(hsl, 58, 42, 60, 0.1);
  const line = tuned(hsl, 55, 44, 62, 0.42);
  const ringColor = tuned(hsl, 50, 42, 60, 0.32);

  return {
    heading: { color: headingColor },
    badge: {
      color: badgeText,
      borderColor: border,
      backgroundColor: surface,
    },
    rule: {
      backgroundImage: `linear-gradient(90deg, ${line}, ${tuned(hsl, 55, 44, 62, 0.1)} 55%, transparent)`,
    },
    ring: { boxShadow: `0 0 0 1px ${ringColor}` },
  };
}
