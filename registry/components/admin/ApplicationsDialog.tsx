'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/format';
import type { ApplicationRow } from '@/types/database';

interface ApplicationsDialogProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  nieuw: 'Nieuw',
  in_behandeling: 'In behandeling',
  aangenomen: 'Aangenomen',
  afgewezen: 'Afgewezen',
};

const STATUS_STYLE: Record<string, string> = {
  nieuw: 'border-creme/35 text-creme',
  in_behandeling: 'border-line text-muted',
  aangenomen: 'border-sondravo-green/50 text-[#7ddba3]',
  afgewezen: 'border-sondravo-red/40 text-[#f2a9ac]',
};

export function ApplicationsDialog({ open, onClose }: ApplicationsDialogProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** Haalt de lijst op. Geeft een lege lijst terug als er iets misgaat. */
  const haalOp = useCallback(async (): Promise<ApplicationRow[]> => {
    try {
      const response = await fetch('/api/applications', { cache: 'no-store' });
      const payload = (await response.json()) as { applications?: ApplicationRow[]; error?: string };

      if (!response.ok) {
        toast(payload.error ?? 'Kon de sollicitaties niet ophalen.', 'error');
        return [];
      }
      return payload.applications ?? [];
    } catch {
      toast('Kon de sollicitaties niet ophalen.', 'error');
      return [];
    }
  }, [toast]);

  // De dialoog wordt pas gemount wanneer hij opent, dus dit draait precies
  // één keer per opening.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const uitkomst = await haalOp();
      if (!cancelled) setRows(uitkomst);
    })();

    return () => {
      cancelled = true;
    };
    // Bewust leeg: deze ophaalactie hoort bij het openen van de dialoog, niet
    // bij elke wijziging van haalOp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    try {
      const response = await fetch('/api/applications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        toast(payload.error ?? 'Bijwerken mislukt.', 'error');
        return;
      }

      toast(`Op "${STATUS_LABEL[status] ?? status}" gezet.`, 'success');
      setRows(await haalOp());
    } catch {
      toast('Bijwerken mislukt.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sollicitaties"
      description="Wie zich heeft aangemeld via het formulier."
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Sluiten
          </Button>
        </div>
      }
    >
      {rows === null ? (
        <p className="py-6 text-center text-sm text-muted">Bezig met laden…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Er staan nog geen sollicitaties open.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-line bg-panel-high p-3.5">
              <div className="flex items-start gap-3">
                {row.avatar_url ? (
                  <Image
                    src={row.avatar_url}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel-hover text-xs text-muted">
                    {row.name.slice(0, 2).toUpperCase()}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{row.name}</p>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${
                        STATUS_STYLE[row.status] ?? 'border-line text-muted'
                      }`}
                    >
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </div>

                  <p className="mt-0.5 text-xs text-muted">
                    {row.discord_username ? `@${row.discord_username}` : 'Discord onbekend'}
                    {row.age ? ` · ${row.age} jaar` : ''}
                    {row.phone ? ` · ${row.phone}` : ''}
                    {' · '}
                    {formatDateTime(row.created_at)}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2 border-t border-line-soft pt-3">
                <Veld label="Waarom Sondravo" waarde={row.motivation} />
                <Veld label="Ervaring" waarde={row.experience} />
                <Veld label="Beschikbaarheid" waarde={row.availability} />
              </div>

              {row.handled_by ? (
                <p className="mt-2 text-[11px] text-muted-soft">
                  Laatst behandeld door {row.handled_by}
                  {row.handled_at ? ` op ${formatDateTime(row.handled_at)}` : ''}.
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  loading={busyId === row.id}
                  disabled={busyId !== null || row.status === 'aangenomen'}
                  onClick={() => setStatus(row.id, 'aangenomen')}
                >
                  Aannemen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busyId !== null || row.status === 'in_behandeling'}
                  onClick={() => setStatus(row.id, 'in_behandeling')}
                >
                  In behandeling
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busyId !== null || row.status === 'afgewezen'}
                  onClick={() => setStatus(row.id, 'afgewezen')}
                >
                  Afwijzen
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Veld({ label, waarde }: { label: string; waarde: string | null }) {
  if (!waarde) return null;
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-ink/80">{waarde}</p>
    </div>
  );
}
