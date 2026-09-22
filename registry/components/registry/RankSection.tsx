'use client';

import { MemberRow } from '@/components/registry/MemberRow';
import { toneStyle } from '@/lib/ranks';
import type { Rank, RegistryMember } from '@/types';

interface RankSectionProps {
  rank: Rank;
  members: RegistryMember[];
  ranks: Rank[];
  onEdit?: (member: RegistryMember) => void;
  onDelete?: (member: RegistryMember) => void;
  onRankChange?: (member: RegistryMember, rank: string) => Promise<void>;
}

/**
 * Eén rang met zijn leden. Groepen zonder leden worden door de ledenlijst
 * overgeslagen, dus deze component gaat uit van minimaal één lid.
 */
export function RankSection({
  rank,
  members,
  ranks,
  onEdit,
  onDelete,
  onRankChange,
}: RankSectionProps) {
  const tone = toneStyle(rank.tone);

  return (
    <section aria-labelledby={`rang-${rank.key}`} className="animate-fade-up">
      <div className="mb-2.5 flex items-center gap-3 px-1">
        <h3
          id={`rang-${rank.key}`}
          className={`flex items-center gap-2 font-display text-[13px] font-semibold uppercase tracking-[0.2em] ${tone.heading}`}
        >
          <span aria-hidden className="text-sm leading-none">
            {rank.glyph}
          </span>
          {rank.label}
        </h3>
        <div className={`h-px flex-1 bg-gradient-to-r ${tone.rule}`} aria-hidden />
        <span className="font-display text-[13px] tabular-nums text-muted">{members.length}</span>
      </div>

      <ul className="panel panel-sheen divide-y divide-line-soft overflow-hidden">
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            rank={rank}
            ranks={ranks}
            onEdit={onEdit}
            onDelete={onDelete}
            onRankChange={onRankChange}
          />
        ))}
      </ul>
    </section>
  );
}
