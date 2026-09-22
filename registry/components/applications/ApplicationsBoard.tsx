'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime, relativeTime } from '@/lib/format';
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

/**
 * Elke status heeft zijn eigen kleur, en die loopt door de hele kaart: het
 * streepje aan de zijkant, het bolletje en de tekst in de pil. Zo zie je in
 * één oogopslag wat er aandacht vraagt, zonder te lezen.
 *
 * Oranje is bewust de enige kleur die nergens anders op de site voorkomt —
 * daardoor springt een nieuwe sollicitatie er meteen uit.
 */
const STATUS: Record<
  string,
  { label: string; pil: string; stip: string; rand: string; vlak: string }
> = {
  nieuw: {
    label: 'Nieuw',
    pil: 'border-[#e0871f]/45 bg-[#e0871f]/10 text-[#f0ab5e]',
    stip: 'bg-[#f0ab5e]',
    rand: 'bg-[#e0871f]',
    vlak: 'bg-[#e0871f]/[0.06]',
  },
  in_behandeling: {
    label: 'In behandeling',
    pil: 'border-creme/30 bg-creme/5 text-creme',
    stip: 'bg-creme',
    rand: 'bg-creme/70',
    vlak: 'bg-creme/[0.03]',
  },
  aangenomen: {
    label: 'Aangenomen',
    pil: 'border-sondravo-green/50 bg-sondravo-green/10 text-[#7ddba3]',
    stip: 'bg-[#7ddba3]',
    rand: 'bg-[#2fa36b]',
    vlak: 'bg-sondravo-green/[0.06]',
  },
  afgewezen: {
    label: 'Afgewezen',
    pil: 'border-sondravo-red/40 bg-sondravo-red/10 text-[#f2a9ac]',
    stip: 'bg-[#f2a9ac]',
    rand: 'bg-sondravo-red',
    vlak: 'bg-sondravo-red/[0.05]',
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
      {rows.map((row) => (
        <ApplicationCard
          key={row.id}
          row={row}
          stand={votes[row.id] ?? { ja: 0, nee: 0, mine: null }}
          isAdmin={isAdmin}
          bezig={busy === row.id}
          geblokkeerd={busy !== null}
          onStem={(keuze) => stem(row.id, keuze)}
          onStatus={(status) => zetStatus(row.id, status)}
        />
      ))}
    </ul>
  );
}

export interface ApplicationCardProps {
  row: ApplicationRow;
  stand: VoteTally;
  isAdmin: boolean;
  bezig: boolean;
  /** Uitgeschakeld wanneer er elders al een actie loopt. */
  geblokkeerd: boolean;
  onStem: (keuze: 'ja' | 'nee') => void;
  onStatus: (status: string) => void;
}

/**
 * Eén sollicitatie.
 *
 * Los van het overzicht, zodat de kaart op zichzelf te bekijken en te
 * beoordelen is zonder dat er een ingelogde sessie en een database bij komen
 * kijken.
 */
export function ApplicationCard({
  row,
  stand,
  isAdmin,
  bezig,
  geblokkeerd,
  onStem,
  onStatus,
}: ApplicationCardProps) {
  const status = STATUS[row.status] ?? STATUS['nieuw']!;
  const besloten = row.status === 'aangenomen' || row.status === 'afgewezen';

  return (
<li
  key={row.id}
  className="relative overflow-hidden rounded-xl border border-line bg-panel"
>
  {/* Het streepje links draagt de statuskleur over de hele kaart. */}
  <span
    aria-hidden
    className={`absolute inset-y-0 left-0 w-1 ${status.rand}`}
  />

  {/* ---------- Kop ----------

      Naam, status en de stand stonden op één regel naast elkaar.
      Op een telefoon brak dat in vier stukken. Nu staat elk ding
      op zijn eigen regel, in volgorde van belangrijkheid. */}
  <div className={`border-b border-line-soft px-3.5 py-3.5 pl-5 sm:px-5 sm:pl-6 ${status.vlak}`}>
    <div className="flex items-center gap-3">
      {row.avatar_url ? (
        <Image
          src={row.avatar_url}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line"
        />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel-hover text-xs font-medium text-muted ring-1 ring-line">
          {row.name.slice(0, 2).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[17px] leading-tight tracking-wide text-creme">
          {row.name}
        </p>
        {row.discord_username ? (
          <p className="truncate text-xs text-muted">@{row.discord_username}</p>
        ) : null}
      </div>

      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] ${status.pil}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${status.stip}`} aria-hidden />
        {status.label}
      </span>
    </div>

    {/* Losse feiten op één regel, met de stand er tegenover. */}
    <div className="mt-2.5 flex items-center justify-between gap-3">
      <p className="min-w-0 truncate text-[11px] text-muted-soft">
        {/* "22-09-2026, 18:06" werd op een telefoon afgekapt tot "18:...".
            "2 uur geleden" past wel, en zegt bij een sollicitatie meer. */}
        {[row.age ? `${row.age} jaar` : null, row.phone, relativeTime(row.created_at)]
          .filter(Boolean)
          .join('  ·  ')}
      </p>

      <div className="flex shrink-0 items-center gap-1.5">
        <Teller icoon="check" aantal={stand.ja} toon="groen" />
        <Teller icoon="cross" aantal={stand.nee} toon="rood" />
      </div>
    </div>
  </div>

  {/* ---------- Inhoud ---------- */}
  <div className="space-y-3 px-3.5 py-3.5 pl-5 sm:px-5 sm:pl-6">
    <Veld label="Waarom Sondravo" waarde={row.motivation} nadruk />
    {row.experience || row.availability ? (
      <div className="grid gap-3 sm:grid-cols-2">
        <Veld label="Ervaring in FiveM" waarde={row.experience} />
        <Veld label="Wanneer online" waarde={row.availability} />
      </div>
    ) : null}
  </div>

  {/* ---------- Stemmen ----------

      Op een afgehandelde sollicitatie valt niets meer te stemmen.
      De stand blijft staan als verantwoording van het besluit, maar
      de knoppen verdwijnen. */}
  {besloten ? null : (
    <div className="border-t border-line-soft px-3.5 py-3 pl-5 sm:px-5 sm:pl-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
          Jouw stem
        </span>

        <StemKnop
          actief={stand.mine === 'ja'}
          toon="groen"
          disabled={bezig}
          onClick={() => onStem('ja')}
          label="Voor"
        />
        <StemKnop
          actief={stand.mine === 'nee'}
          toon="rood"
          disabled={bezig}
          onClick={() => onStem('nee')}
          label="Tegen"
        />
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-soft">
        {stand.mine
          ? 'Nog een keer op dezelfde knop klikken trekt je stem in.'
          : 'Je stem is advies — de Lead neemt het besluit.'}
      </p>
    </div>
  )}

  {/* ---------- Beslissen (alleen Lead) ---------- */}
  {isAdmin ? (
    <div className="border-t border-line-soft bg-panel-high px-3.5 py-3 pl-5 sm:px-5 sm:pl-6">
      {row.handled_by ? (
        <p className="mb-2.5 text-[11px] text-muted-soft">
          Laatst behandeld door {row.handled_by}
          {row.handled_at ? ` op ${formatDateTime(row.handled_at)}` : ''}.
        </p>
      ) : null}

      {/* De twee besluiten naast elkaar, "in behandeling" eronder
          over de volle breedte. Drie knoppen op een rij worden op
          een telefoon onleesbaar smal. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button
          type="button"
          size="sm"
          variant="primary"
          loading={bezig}
          disabled={geblokkeerd || row.status === 'aangenomen'}
          onClick={() => onStatus('aangenomen')}
        >
          Aannemen
        </Button>
        <Button
          type="button"
          size="sm"
          variant="danger"
          disabled={geblokkeerd || row.status === 'afgewezen'}
          onClick={() => onStatus('afgewezen')}
        >
          Afwijzen
        </Button>
        <span className="col-span-2 sm:col-auto">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={geblokkeerd || row.status === 'in_behandeling'}
            onClick={() => onStatus('in_behandeling')}
          >
            In behandeling
          </Button>
        </span>
      </div>
    </div>
  ) : null}
</li>
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
