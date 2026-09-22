import { toneStyle } from '@/lib/ranks';
import type { Rank } from '@/types';

export function RankBadge({ rank, className = '' }: { rank: Rank; className?: string }) {
  const tone = toneStyle(rank.tone);

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${tone.badge} ${className}`}
    >
      <span aria-hidden className="text-[11px] leading-none">
        {rank.glyph}
      </span>
      {rank.label}
    </span>
  );
}
