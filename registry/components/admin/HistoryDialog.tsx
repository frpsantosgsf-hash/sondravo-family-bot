'use client';

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { getAuditLogAction } from '@/lib/actions';
import { describeAuditEntry, formatDateTime, relativeTime } from '@/lib/format';
import type { AuditEntry, Rank } from '@/types';

interface HistoryDialogProps {
  open: boolean;
  ranks: Rank[];
  onClose: () => void;
}

/** Volledige beheerhistorie. Alleen leesbaar voor admins (ook database-side). */
export function HistoryDialog({ open, ranks, onClose }: HistoryDialogProps) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rankLabel = useCallback(
    (key: string) => ranks.find((rank) => rank.key === key)?.label ?? key,
    [ranks],
  );

  // De dialoog wordt pas gemount wanneer hij opent, dus dit draait precies
  // één keer per opening.
  useEffect(() => {
    let cancelled = false;

    void getAuditLogAction().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setEntries(result.entries);
      } else {
        setError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="History"
      description="Alles wat er in het register gewijzigd is, nieuwste eerst."
      size="lg"
    >
      {error ? (
        <p role="alert" className="text-sm text-[#f2a9ac]">
          {error}
        </p>
      ) : entries === null ? (
        <ul className="space-y-3" aria-busy="true" aria-label="History wordt geladen">
          {Array.from({ length: 6 }).map((_, index) => (
            <li key={index} className="flex gap-3">
              <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-24" />
              </div>
            </li>
          ))}
        </ul>
      ) : entries.length === 0 ? (
        <EmptyState
          title="Nog geen history"
          description="Zodra er iets gewijzigd wordt, verschijnt het hier."
          icon="⟲"
        />
      ) : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {entries.map((entry) => (
            <li key={entry.id} className="relative">
              <span
                aria-hidden
                className={`absolute -left-[1.4rem] top-1.5 h-1.5 w-1.5 rounded-full ${dotClass(entry.action)}`}
              />
              <p className="text-sm leading-relaxed text-ink">
                {describeAuditEntry(entry, rankLabel)}
              </p>
              <p className="mt-0.5 text-xs text-muted-soft">
                <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)}>
                  {relativeTime(entry.createdAt)}
                </time>
              </p>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

function dotClass(action: string): string {
  if (action.endsWith('deleted') || action.endsWith('cleared')) return 'bg-sondravo-red/80';
  if (action.endsWith('created')) return 'bg-sondravo-green';
  if (action === 'member.rank_changed') return 'bg-creme/80';
  return 'bg-line';
}
