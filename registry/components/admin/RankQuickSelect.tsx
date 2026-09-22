'use client';

import { useState } from 'react';
import { toneStyle } from '@/lib/ranks';
import { Spinner } from '@/components/ui/Button';
import type { Rank, RegistryMember } from '@/types';

interface RankQuickSelectProps {
  member: RegistryMember;
  rank: Rank;
  ranks: Rank[];
  onChange: (member: RegistryMember, rank: string) => Promise<void>;
}

/**
 * Rang wijzigen zonder de bewerkmodal te openen: het snelle pad in admin-modus.
 * Ziet eruit als de gewone rangbadge, maar is een echte select.
 */
export function RankQuickSelect({ member, rank, ranks, onChange }: RankQuickSelectProps) {
  const [pending, setPending] = useState(false);
  const tone = toneStyle(rank.tone);

  async function handleChange(value: string) {
    if (value === member.rank) return;
    setPending(true);
    try {
      await onChange(member, value);
    } finally {
      setPending(false);
    }
  }

  return (
    <span
      className={`relative inline-flex items-center rounded-full border transition-colors ${tone.badge} ${
        pending ? 'opacity-60' : 'hover:brightness-125'
      }`}
    >
      <span aria-hidden className="pointer-events-none flex items-center gap-1.5 py-1 pl-2.5 pr-6 text-[10px] font-medium uppercase tracking-[0.16em]">
        {pending ? <Spinner className="h-3 w-3" /> : <span className="text-[11px] leading-none">{rank.glyph}</span>}
        {rank.label}
      </span>
      <svg
        viewBox="0 0 20 20"
        aria-hidden
        className="pointer-events-none absolute right-2 h-3 w-3 opacity-70"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <select
        value={member.rank}
        disabled={pending}
        onChange={(event) => void handleChange(event.target.value)}
        aria-label={`Rang van ${member.name} wijzigen`}
        className="absolute inset-0 cursor-pointer appearance-none bg-transparent text-transparent opacity-0"
      >
        {ranks.map((option) => (
          <option key={option.key} value={option.key} className="bg-panel text-ink">
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}
