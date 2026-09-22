import type { Rank, RankTone } from '@/types';

/**
 * De rangladder van The Sondravo Family, hoog naar laag.
 *
 * De database (`public.ranks.sort_order`) is de bron van waarheid. Deze lijst
 * is de fallback wanneer de tabel nog leeg is en bepaalt daarnaast de
 * schrijfwijze in de UI. De volgorde wordt NOOIT alfabetisch gesorteerd.
 */
export const RANK_LADDER: Rank[] = [
  { key: 'mpitarika', label: 'Mpitarika', glyph: '♛', tone: 'gold', sortOrder: 1 },
  { key: 'lefitra', label: 'Lefitra', glyph: '✦', tone: 'red', sortOrder: 2 },
  { key: 'mpanoro', label: 'Mpanoro', glyph: '✦', tone: 'red', sortOrder: 3 },
  { key: 'mpifehy', label: 'Mpifehy', glyph: '✦', tone: 'red', sortOrder: 4 },
  { key: 'hery', label: 'Hery', glyph: '◆', tone: 'green', sortOrder: 5 },
  { key: 'mpiady', label: 'Mpiady', glyph: '◆', tone: 'green', sortOrder: 6 },
  { key: 'zoky', label: 'Zoky', glyph: '◈', tone: 'stone', sortOrder: 7 },
  { key: 'mpikambana', label: 'Mpikambana', glyph: '●', tone: 'neutral', sortOrder: 8 },
  { key: 'zazavao', label: 'Zazavao', glyph: '○', tone: 'muted', sortOrder: 9 },
];

export const DEFAULT_RANK_KEY = 'zazavao';

export function sortRanks(ranks: Rank[]): Rank[] {
  return [...ranks].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function findRank(ranks: Rank[], key: string): Rank | undefined {
  return ranks.find((rank) => rank.key === key);
}

/**
 * Terughoudend kleurgebruik: rood en groen zijn accenten, geen thema.
 * Elke tone levert de klassen voor de rangkop, de badge en het accentlijntje.
 */
interface ToneStyle {
  /** Tekstkleur van de rangkop en het glyph. */
  heading: string;
  /** Badge op de ledenrij. */
  badge: string;
  /** Dun verticaal accentlijntje links van een groep. */
  rule: string;
  /** Ring rond de avatar. */
  ring: string;
}

const TONE_STYLES: Record<RankTone, ToneStyle> = {
  gold: {
    heading: 'text-creme',
    badge: 'border-creme/25 bg-creme/10 text-creme',
    rule: 'from-creme/45 via-creme/10 to-transparent',
    ring: 'ring-creme/35',
  },
  red: {
    heading: 'text-creme/90',
    badge: 'border-sondravo-red/35 bg-sondravo-red/12 text-[#F0A7AA]',
    rule: 'from-sondravo-red/45 via-sondravo-red/8 to-transparent',
    ring: 'ring-sondravo-red/30',
  },
  green: {
    heading: 'text-creme/90',
    badge: 'border-sondravo-green/45 bg-sondravo-green/15 text-[#8FCBA6]',
    rule: 'from-sondravo-green/60 via-sondravo-green/12 to-transparent',
    ring: 'ring-sondravo-green/35',
  },
  stone: {
    heading: 'text-creme/80',
    badge: 'border-creme/15 bg-creme/[0.06] text-creme/75',
    rule: 'from-creme/28 via-creme/6 to-transparent',
    ring: 'ring-creme/20',
  },
  neutral: {
    heading: 'text-ink/85',
    badge: 'border-line bg-panel-high text-ink/70',
    rule: 'from-ink/25 via-ink/8 to-transparent',
    ring: 'ring-line',
  },
  muted: {
    heading: 'text-muted',
    badge: 'border-line bg-panel/80 text-muted',
    rule: 'from-ink/15 via-ink/5 to-transparent',
    ring: 'ring-line',
  },
};

export function toneStyle(tone: RankTone): ToneStyle {
  return TONE_STYLES[tone] ?? TONE_STYLES.neutral;
}
