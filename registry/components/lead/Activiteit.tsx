import Link from 'next/link';
import { describeAuditEntry, relativeTime } from '@/lib/format';
import type { AuditEntry, Rank } from '@/types';

/**
 * De laatste regels uit het logboek.
 *
 * Kort gehouden: dit is een geruststelling ("er is niets achter mijn rug om
 * gebeurd"), geen onderzoeksmiddel. Daarvoor is de volledige history bij de
 * ledenlijst.
 */
export function Activiteit({ entries, ranks }: { entries: AuditEntry[]; ranks: Rank[] }) {
  const labelVoor = (key: string) => ranks.find((rang) => rang.key === key)?.label ?? key;

  return (
    <section aria-labelledby="activiteit-kop" className="panel overflow-hidden border border-line">
      <header className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3.5 sm:px-5">
        <h2
          id="activiteit-kop"
          className="font-display text-sm uppercase tracking-[0.14em] text-creme"
        >
          Laatste activiteit
        </h2>
        <Link
          href="/leden"
          className="text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
        >
          Alles
        </Link>
      </header>

      {entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted sm:px-5">Er is nog niets gebeurd.</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-creme/35" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-ink/90">
                  {describeAuditEntry(entry, labelVoor)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-soft">
                  {relativeTime(entry.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
