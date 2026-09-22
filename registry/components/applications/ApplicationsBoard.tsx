'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/format';
import type { ApplicationRow } from '@/types/database';

/** De stand van de stemming bij één sollicitatie. */
export interface VoteTally {
  ja: number;
  nee: number;
  mine: 'ja' | 'nee' | null;
}

interface Payload {
  applications?: ApplicationRow[];
  votes?: Record<string, VoteTally>;
  isAdmin?: boolean;
  error?: string;
}

const STATUS: Record<string, { label: string; ring: string; dot: string }> = {
  nieuw: { label: 'Nieuw', ring: 'border-creme/35 text-creme', dot: 'bg-creme' },
  in_behandeling: { label: 'In behandeling', ring: 'border-line text-muted', dot: 'bg-muted' },
  aangenomen: {
    label: 'Aangenomen',
    ring: 'border-sondravo-green/50 text-[#7ddba3]',
    dot: 'bg-[#7ddba3]',
  },
  afgewezen: {
    label: 'Afgewezen',
    ring: 'border-sondravo-red/40 text-[#f2a9ac]',
    dot: 'bg-[#f2a9ac]',
  },
};

export function ApplicationsBoard({ compact = false }: { compact?: boolean }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [votes, setVotes] = useState<Record<string, VoteTally>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const haalOp = useCallback(async (): Promise<Payload> => {
    try {
      const response = await fetch('/api/applications', { cache: 'no-store' });
      const payload = (await response.json()) as Payload;

      if (!response.ok) {
        toast(payload.error ?? 'Kon de sollicitaties niet ophalen.', 'error');
        return { applications: [] };
      }
      return payload;
    } catch {
      toast('Kon de sollicitaties niet ophalen.', 'error');
      return { applications: [] };
    }
  }, [toast]);

  const verwerk = useCallback((payload: Payload) => {
    setRows(payload.applications ?? []);
    setVotes(payload.votes ?? {});
    setIsAdmin(payload.isAdmin === true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const payload = await haalOp();
      if (!cancelled) verwerk(payload);
    })();

    return () => {
      cancelled = true;
    };
    // Eén keer bij het openen; verder ververst elke actie zelf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Stemmen. Nog een keer op dezelfde knop trekt je stem weer in. */
  async function stem(id: string, keuze: 'ja' | 'nee') {
    const huidig = votes[id]?.mine ?? null;
    const nieuw = huidig === keuze ? null : keuze;

    setBusy(id);
    try {
      const response = await fetch('/api/applications/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ applicationId: id, vote: nieuw }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        toast(payload.error ?? 'Stemmen lukte niet.', 'error');
        return;
      }

      verwerk(await haalOp());
    } catch {
      toast('Stemmen lukte niet.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function zetStatus(id: string, status: string) {
    setBusy(id);
    try {
      const response = await fetch('/api/applications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        toast(payload.error ?? 'Bijwerken mislukt.', 'error');
        return;
      }

      toast(`Op "${STATUS[status]?.label ?? status}" gezet.`, 'success');
      verwerk(await haalOp());
    } catch {
      toast('Bijwerken mislukt.', 'error');
    } finally {
      setBusy(null);
    }
  }

  if (rows === null) {
    return <p className="py-10 text-center text-sm text-muted">Bezig met laden…</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-panel px-5 py-10 text-center">
        <p className="text-sm text-ink/80">Er staan op dit moment geen sollicitaties open.</p>
        <p className="mt-1.5 text-xs text-muted">
          Zodra iemand het formulier invult, verschijnt hij hier.
        </p>
      </div>
    );
  }

  return (
    <ul className={compact ? 'space-y-3' : 'space-y-4'}>
      {rows.map((row) => {
        const stand = votes[row.id] ?? { ja: 0, nee: 0, mine: null };
        const status = STATUS[row.status] ?? STATUS['nieuw']!;
        const bezig = busy === row.id;

        return (
          <li
            key={row.id}
            className="overflow-hidden rounded-xl border border-line bg-panel"
          >
            {/* ---------- Kop ---------- */}
            <div className="flex items-start gap-3.5 border-b border-line-soft bg-panel-high px-4 py-3.5 sm:px-5">
              {row.avatar_url ? (
                <Image
                  src={row.avatar_url}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-line"
                />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-panel-hover text-xs font-medium text-muted ring-1 ring-line">
                  {row.name.slice(0, 2).toUpperCase()}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <p className="font-display text-base tracking-wide text-creme">{row.name}</p>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${status.ring}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden />
                    {status.label}
                  </span>
                </div>

                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {[
                    row.discord_username ? `@${row.discord_username}` : null,
                    row.age ? `${row.age} jaar` : null,
                    row.phone,
                    formatDateTime(row.created_at),
                  ]
                    .filter(Boolean)
                    .join('  ·  ')}
                </p>
              </div>

              {/* Stand van de stemming, altijd rechtsboven zichtbaar. */}
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <Teller icoon="check" aantal={stand.ja} toon="groen" />
                <Teller icoon="cross" aantal={stand.nee} toon="rood" />
              </div>
            </div>

            {/* ---------- Inhoud ---------- */}
            <div className="space-y-3.5 px-4 py-4 sm:px-5">
              <Veld label="Waarom Sondravo" waarde={row.motivation} nadruk />
              <Veld label="Ervaring in FiveM" waarde={row.experience} />
              <Veld label="Wanneer online" waarde={row.availability} />
            </div>

            {/* ---------- Stemmen ---------- */}
            <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3 sm:px-5">
              <span className="mr-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                Jouw stem
              </span>

              <StemKnop
                actief={stand.mine === 'ja'}
                toon="groen"
                disabled={bezig}
                onClick={() => stem(row.id, 'ja')}
                label="Voor"
              />
              <StemKnop
                actief={stand.mine === 'nee'}
                toon="rood"
                disabled={bezig}
                onClick={() => stem(row.id, 'nee')}
                label="Tegen"
              />

              {stand.mine ? (
                <span className="text-[11px] text-muted-soft">
                  Nog een keer klikken trekt je stem in.
                </span>
              ) : null}
            </div>

            {/* ---------- Beslissen (alleen Lead) ---------- */}
            {isAdmin ? (
              <div className="border-t border-line-soft bg-panel-high px-4 py-3 sm:px-5">
                {row.handled_by ? (
                  <p className="mb-2.5 text-[11px] text-muted-soft">
                    Laatst behandeld door {row.handled_by}
                    {row.handled_at ? ` op ${formatDateTime(row.handled_at)}` : ''}.
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    loading={bezig}
                    disabled={busy !== null || row.status === 'aangenomen'}
                    onClick={() => zetStatus(row.id, 'aangenomen')}
                  >
                    Aannemen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy !== null || row.status === 'in_behandeling'}
                    onClick={() => zetStatus(row.id, 'in_behandeling')}
                  >
                    In behandeling
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null || row.status === 'afgewezen'}
                    onClick={() => zetStatus(row.id, 'afgewezen')}
                  >
                    Afwijzen
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function Veld({
  label,
  waarde,
  nadruk = false,
}: {
  label: string;
  waarde: string | null;
  nadruk?: boolean;
}) {
  if (!waarde) return null;
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p
        className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed ${
          nadruk ? 'text-ink/90' : 'text-ink/70'
        }`}
      >
        {waarde}
      </p>
    </div>
  );
}

function Teller({
  icoon,
  aantal,
  toon,
}: {
  icoon: 'check' | 'cross';
  aantal: number;
  toon: 'groen' | 'rood';
}) {
  const kleur =
    aantal === 0
      ? 'border-line text-muted-soft'
      : toon === 'groen'
        ? 'border-sondravo-green/45 text-[#7ddba3]'
        : 'border-sondravo-red/40 text-[#f2a9ac]';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium tabular-nums ${kleur}`}
    >
      <Icoon soort={icoon} />
      {aantal}
    </span>
  );
}

function StemKnop({
  actief,
  toon,
  label,
  disabled,
  onClick,
}: {
  actief: boolean;
  toon: 'groen' | 'rood';
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const basis =
    'tap-target inline-flex items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-55';

  const kleur = actief
    ? toon === 'groen'
      ? 'border-sondravo-green/60 bg-sondravo-green/20 text-[#8fe3b0]'
      : 'border-sondravo-red/55 bg-sondravo-red/15 text-[#f5b8bb]'
    : 'border-line bg-panel-high text-muted hover:border-creme/25 hover:text-ink';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={actief}
      className={`${basis} ${kleur}`}
    >
      <Icoon soort={toon === 'groen' ? 'check' : 'cross'} />
      {label}
    </button>
  );
}

function Icoon({ soort }: { soort: 'check' | 'cross' }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {soort === 'check' ? <path d="M3 8.5l3.5 3.5L13 5" /> : <path d="M4 4l8 8M12 4l-8 8" />}
    </svg>
  );
}
