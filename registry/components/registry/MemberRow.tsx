'use client';

import { Avatar } from '@/components/registry/Avatar';
import { RankBadge } from '@/components/registry/RankBadge';
import { RankQuickSelect } from '@/components/admin/RankQuickSelect';
import { rankAccent } from '@/lib/ranks';
import { displayName, formatDiscordHandle, formatPhone } from '@/lib/format';
import type { Rank, RegistryMember } from '@/types';

interface MemberRowProps {
  member: RegistryMember;
  rank: Rank;
  /** Volledige rangladder, nodig voor het snel wisselen van rang. */
  ranks: Rank[];
  /** Beheeracties; alleen meegegeven wanneer de bezoeker admin is. */
  onEdit?: (member: RegistryMember) => void;
  onDelete?: (member: RegistryMember) => void;
  onRankChange?: (member: RegistryMember, rank: string) => Promise<void>;
}

/**
 * Eén lid.
 *
 * Mobiel leest dit als een Discord-achtige kaart, vanaf `sm` schuift alles in
 * kolommen zodat het als strakke tabel oogt. Geen aparte markup, één rij.
 */
export function MemberRow({
  member,
  rank,
  ranks,
  onEdit,
  onDelete,
  onRankChange,
}: MemberRowProps) {
  const accent = rankAccent(rank.color);
  const handle = formatDiscordHandle(member.discordUsername);
  const phone = formatPhone(member.phone);
  const isAdmin = Boolean(onEdit && onDelete);

  return (
    <li className="group relative flex items-center gap-3 px-3 py-3 transition-colors duration-150 hover:bg-panel-hover/60 sm:gap-4 sm:px-4">
      <Avatar name={member.name} src={member.avatarUrl} ring={accent.ring} />

      {/* Naam + Discord */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] font-medium tracking-wide text-ink">
          {displayName(member.name)}
        </p>
        <p className="mt-0.5 flex items-center gap-2 truncate text-[13px] text-muted">
          {handle ? (
            <span className="truncate">{handle}</span>
          ) : (
            <span className="truncate text-muted-soft">Geen Discord gekoppeld</span>
          )}
        </p>

        {/* Op mobiel staat de rang onder de naam, net als in Discord */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:hidden">
          {onRankChange ? (
            <RankQuickSelect member={member} rank={rank} ranks={ranks} onChange={onRankChange} />
          ) : (
            <RankBadge rank={rank} />
          )}
          {phone ? <PhoneTag phone={phone} /> : null}
        </div>
      </div>

      {/* Telefoon — eigen kolom op tablet en groter */}
      <div className="hidden w-36 shrink-0 md:block">
        {phone ? (
          <PhoneTag phone={phone} />
        ) : (
          <span className="text-[13px] text-muted-soft">—</span>
        )}
      </div>

      {/* Rang — eigen kolom vanaf sm */}
      <div className="hidden w-40 shrink-0 justify-end sm:flex">
        {onRankChange ? (
          <RankQuickSelect member={member} rank={rank} ranks={ranks} onChange={onRankChange} />
        ) : (
          <RankBadge rank={rank} />
        )}
      </div>

      {isAdmin ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit?.(member)}
            aria-label={`${member.name} bewerken`}
            className="tap-target flex items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel-high hover:text-ink focus-visible:opacity-100 sm:opacity-45 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onDelete?.(member)}
            aria-label={`${member.name} verwijderen`}
            className="tap-target flex items-center justify-center rounded-lg text-muted transition-colors hover:bg-sondravo-red/15 hover:text-[#f2a9ac] focus-visible:opacity-100 sm:opacity-45 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 6h12M8 6V4.5h4V6M6.5 6l.6 9.5h5.8L13.5 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </li>
  );
}

function PhoneTag({ phone }: { phone: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] tabular-nums text-muted">
      <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-soft" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="6" y="2.5" width="8" height="15" rx="2" />
        <path d="M9 15h2" strokeLinecap="round" />
      </svg>
      <span className="sr-only">Ingame telefoonnummer: </span>
      {phone}
    </span>
  );
}
