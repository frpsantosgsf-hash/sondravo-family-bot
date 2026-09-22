'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SearchBar } from '@/components/registry/SearchBar';
import { RankSection } from '@/components/registry/RankSection';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { MemberDialog } from '@/components/admin/MemberDialog';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { HistoryDialog } from '@/components/admin/HistoryDialog';
import { SettingsDialog } from '@/components/admin/SettingsDialog';
import { changeRankAction, deleteMemberAction } from '@/lib/actions';
import { DEFAULT_RANK_KEY } from '@/lib/ranks';
import type { FamilySettings, Rank, RankGroup, RegistryMember, Viewer } from '@/types';

interface RegistryViewProps {
  members: RegistryMember[];
  ranks: Rank[];
  settings: FamilySettings;
  viewer: Viewer | null;
}

type DialogState =
  | { type: 'none' }
  | { type: 'member'; member: RegistryMember | null }
  | { type: 'delete'; member: RegistryMember }
  | { type: 'history' }
  | { type: 'settings' };

/** Maakt zoeken diakriet- en hoofdletterongevoelig. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function RegistryView({ members, ranks, settings, viewer }: RegistryViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [rankFilter, setRankFilter] = useState('all');
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' });
  const [, startTransition] = useTransition();

  const isAdmin = viewer?.isAdmin === true;

  const rankByKey = useMemo(() => new Map(ranks.map((rank) => [rank.key, rank])), [ranks]);

  /**
   * Filteren en groeperen in één berekening.
   * Lege rangen vallen vanzelf weg; komt er een lid bij in een lege rang, dan
   * verschijnt die groep automatisch weer.
   */
  const groups = useMemo<RankGroup[]>(() => {
    const needle = normalize(query.trim());

    const visible = members.filter((member) => {
      if (rankFilter !== 'all' && member.rank !== rankFilter) return false;
      if (!needle) return true;

      const rankLabel = rankByKey.get(member.rank)?.label ?? member.rank;
      const haystack = normalize(
        [member.name, member.discordUsername ?? '', rankLabel, member.phone ?? ''].join(' '),
      );

      return haystack.includes(needle);
    });

    const byRank = new Map<string, RegistryMember[]>();
    for (const member of visible) {
      const bucket = byRank.get(member.rank);
      if (bucket) {
        bucket.push(member);
      } else {
        byRank.set(member.rank, [member]);
      }
    }

    return ranks
      .map((rank) => ({
        rank,
        members: (byRank.get(rank.key) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }),
        ),
      }))
      .filter((group) => group.members.length > 0);
  }, [members, query, rankFilter, ranks, rankByKey]);

  const visibleCount = groups.reduce((total, group) => total + group.members.length, 0);
  const filtering = query.trim().length > 0 || rankFilter !== 'all';

  const handleRankChange = useCallback(
    async (member: RegistryMember, rank: string) => {
      const result = await changeRankAction(member.id, rank);
      if (result.ok) {
        const label = rankByKey.get(rank)?.label ?? rank;
        toast(`${member.name} staat nu in ${label}.`, 'success');
        startTransition(() => router.refresh());
      } else {
        toast(result.error, 'error');
      }
    },
    [rankByKey, router, toast],
  );

  const handleDelete = useCallback(
    async (member: RegistryMember) => {
      const result = await deleteMemberAction(member.id);
      if (result.ok) {
        toast(result.message, 'success');
        setDialog({ type: 'none' });
        startTransition(() => router.refresh());
      } else {
        toast(result.error, 'error');
      }
    },
    [router, toast],
  );

  const closeDialog = useCallback(() => setDialog({ type: 'none' }), []);

  return (
    <div className="space-y-6">
      {/* Beheerbalk — alleen zichtbaar voor een Lead, en alleen een Lead mag
          daadwerkelijk schrijven (de database bewaakt dat, niet deze knoppen). */}
      {isAdmin ? (
        <div className="panel panel-sheen flex flex-wrap items-center gap-2 p-2.5">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setDialog({ type: 'member', member: null })}
          >
            <span aria-hidden>+</span> Lid toevoegen
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDialog({ type: 'history' })}>
            History
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDialog({ type: 'settings' })}>
            Settings
          </Button>
          <p className="ml-auto hidden pr-1 text-xs text-muted-soft sm:block">
            Klik op een rangbadge om iemand direct te verplaatsen.
          </p>
        </div>
      ) : null}

      <SearchBar
        query={query}
        onQueryChange={setQuery}
        rankFilter={rankFilter}
        onRankFilterChange={setRankFilter}
        ranks={ranks}
        resultCount={visibleCount}
      />

      {groups.length === 0 ? (
        filtering ? (
          <EmptyState
            title="Niemand gevonden"
            description={`Geen lid dat past bij "${query.trim() || 'deze rang'}". Probeer een andere zoekterm of rang.`}
            icon="⌕"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setRankFilter('all');
                }}
              >
                Filters wissen
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Nog geen leden"
            description={
              isAdmin
                ? 'Voeg het eerste lid toe om de lijst te vullen.'
                : 'Zodra de lijst gevuld is, zie je hier alle leden per rang.'
            }
            icon="○"
            action={
              isAdmin ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setDialog({ type: 'member', member: null })}
                >
                  <span aria-hidden>+</span> Lid toevoegen
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <RankSection
              key={group.rank.key}
              rank={group.rank}
              members={group.members}
              ranks={ranks}
              onEdit={isAdmin ? (member) => setDialog({ type: 'member', member }) : undefined}
              onDelete={isAdmin ? (member) => setDialog({ type: 'delete', member }) : undefined}
              onRankChange={isAdmin ? handleRankChange : undefined}
            />
          ))}
        </div>
      )}

      {/* Dialogen worden pas gemount wanneer ze open zijn, zodat elk formulier
          fris begint en er geen oude foutmeldingen blijven hangen. */}
      {isAdmin && dialog.type === 'member' ? (
        <MemberDialog
          open
          member={dialog.member}
          ranks={ranks}
          defaultRank={ranks.at(-1)?.key ?? DEFAULT_RANK_KEY}
          onClose={closeDialog}
        />
      ) : null}

      {isAdmin && dialog.type === 'delete' ? (
        <ConfirmDialog
          open
          title={`${dialog.member.name} verwijderen?`}
          description={`${dialog.member.name} verdwijnt uit de ledenlijst en de teller gaat omlaag.`}
          confirmLabel="Ja, verwijderen"
          onConfirm={() => handleDelete(dialog.member)}
          onClose={closeDialog}
        />
      ) : null}

      {isAdmin && dialog.type === 'history' ? (
        <HistoryDialog open ranks={ranks} onClose={closeDialog} />
      ) : null}

      {isAdmin && dialog.type === 'settings' ? (
        <SettingsDialog
          open
          settings={settings}
          memberCount={members.length}
          onClose={closeDialog}
        />
      ) : null}
    </div>
  );
}
