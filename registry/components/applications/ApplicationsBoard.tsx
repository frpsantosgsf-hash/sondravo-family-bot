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

export function ApplicationsBoard({
  compact = false,
  archief = false,
}: {
  compact?: boolean;
  /** Toont de gearchiveerde sollicitaties in plaats van de openstaande. */
  archief?: boolean;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [votes, setVotes] = useState<Record<string, VoteTally>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const haalOp = useCallback(async (): Promise<Payload> => {
    try {
      const response = await fetch(`/api/applications${archief ? '?archief=1' : ''}`, {
        cache: 'no-store',
      });
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
  }, [toast, archief]);

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
        body: JSON.stringify({ action: 'status', id, status }),
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

  /** Stemming openen of sluiten. */
  async function zetStemming(id: string, closed: boolean) {
    await stuur(
      id,
      { action: 'voting', id, closed },
      closed ? 'Stemming gesloten.' : 'Stemming weer open.',
    );
  }

  /** Naar het archief. De berichten in Discord gaan mee weg. */
  async function archiveer(id: string) {
    await stuur(id, { action: 'archive', id }, 'Naar het archief verplaatst.');
  }

  async function stuur(id: string, body: unknown, melding: string) {
    setBusy(id);
    try {
      const response = await fetch('/api/applications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        toast(payload.error ?? 'Actie mislukt.', 'error');
        return;
      }

      toast(melding, 'success');
      verwerk(await haalOp());
    } catch {
      toast('Actie mislukt.', 'error');
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
        <p className="text-sm text-ink/80">
          {archief ? 'Het archief is nog leeg.' : 'Er staan op dit moment geen sollicitaties open.'}
        </p>
        <p className="mt-1.5 text-xs text-muted">
          {archief
            ? 'Wat je archiveert komt hier te staan, met de stemmen erbij.'
            : 'Zodra iemand het formulier invult, verschijnt hij hier.'}
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
          onStemming={(closed) => zetStemming(row.id, closed)}
          onArchiveer={() => archiveer(row.id)}
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
  onStemming: (closed: boolean) => void;
  onArchiveer: () => void;
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
  onStemming,
  onArchiveer,
}: ApplicationCardProps) {
  const status = STATUS[row.status] ?? STATUS['nieuw']!;
  const gearchiveerd = row.archived_at !== null;
  // Stemmen kan alleen zolang er nog iets te beslissen valt.
  const stemmenDicht =
    gearchiveerd || row.voting_closed || row.status === 'aangenomen' || row.status === 'afgewezen';

  return (
    <li key={row.id} className="relative overflow-hidden rounded-xl border border-line bg-panel">
      {/* Het streepje links draagt de statuskleur over de hele kaart. */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${status.rand}`} />

      {/* ---------- Kop ----------

      Naam, status en de stand stonden op één regel naast elkaar.
      Op een telefoon brak dat in vier stukken. Nu staat elk ding
      op zijn eigen regel, in volgorde van belangrijkheid. */}
      <div
        className={`border-b border-line-soft px-3.5 py-3.5 pl-5 sm:px-5 sm:pl-6 ${status.vlak}`}
      >
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

        {/* Alleen de stand hier: leeftijd, telefoon en tijdstip staan in de
            lijst hieronder, en twee keer hetzelfde leest als ruis. */}
        <div className="mt-2.5 flex items-center justify-end gap-1.5">
          <Teller icoon="check" aantal={stand.ja} toon="groen" />
          <Teller icoon="cross" aantal={stand.nee} toon="rood" />
        </div>
      </div>

      {/* ---------- De feiten ----------

          Korte gegevens als lijst met een icoon per regel. Dat leest sneller
          dan een rij losse woorden achter elkaar, en het icoon vertelt al
          waar je naar kijkt voordat je het label leest. */}
      <div className="border-b border-line-soft px-3.5 py-2.5 pl-5 sm:px-5 sm:pl-6">
        <Feit
          icoon="discord"
          label="Discord"
          waarde={row.discord_username ? `@${row.discord_username}` : null}
        />
        <Feit icoon="persoon" label="Leeftijd" waarde={row.age ? `${row.age} jaar` : null} />
        <Feit icoon="telefoon" label="Ingame telefoon" waarde={row.phone} />
        <Feit icoon="klok" label="Ingestuurd" waarde={relativeTime(row.created_at)} />
      </div>

      {/* ---------- De antwoorden ---------- */}
      <div className="space-y-4 px-3.5 py-3.5 pl-5 sm:px-5 sm:pl-6">
        <Veld icoon="quote" label="Waarom Sondravo" waarde={row.motivation} nadruk />
        <Veld icoon="controller" label="Ervaring in FiveM" waarde={row.experience} />
        <Veld icoon="kalender" label="Wanneer online" waarde={row.availability} />
      </div>

      {/* ---------- Stemmen ----------

      Op een gesloten, afgehandelde of gearchiveerde sollicitatie valt
      niets meer te stemmen. De stand blijft staan als verantwoording
      van het besluit, maar de knoppen verdwijnen. */}
      {stemmenDicht ? (
        row.voting_closed && !gearchiveerd ? (
          <div className="border-t border-line-soft px-3.5 py-2.5 pl-5 sm:px-5 sm:pl-6">
            <p className="text-[11px] text-muted-soft">
              De stemming is gesloten. De stand hierboven blijft staan.
            </p>
          </div>
        ) : null
      ) : (
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

          {gearchiveerd ? (
            <p className="text-[11px] text-muted-soft">
              Gearchiveerd door {row.archived_by ?? 'een Lead'}
              {row.archived_at ? ` op ${formatDateTime(row.archived_at)}` : ''}. De berichten in
              Discord zijn opgeruimd.
            </p>
          ) : (
            <>
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

              {/* Sluiten en archiveren staan los van het besluit: het zijn geen
          oordelen over de persoon maar opruimacties. */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line-soft pt-2.5">
                <button
                  type="button"
                  disabled={geblokkeerd}
                  onClick={() => onStemming(!row.voting_closed)}
                  className="tap-target inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-[11px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-creme/25 hover:text-ink disabled:opacity-55"
                >
                  {row.voting_closed ? 'Stemming heropenen' : 'Stemming sluiten'}
                </button>

                <button
                  type="button"
                  disabled={geblokkeerd}
                  onClick={onArchiveer}
                  className="tap-target inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-[11px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-sondravo-red/40 hover:text-[#f2a9ac] disabled:opacity-55"
                >
                  Archiveren
                </button>

                <span className="text-[11px] text-muted-soft">
                  Archiveren haalt ook de berichten uit Discord weg.
                </span>
              </div>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

/** Eén korte regel: icoon, waar het over gaat, en het antwoord. */
function Feit({
  icoon,
  label,
  waarde,
}: {
  icoon: IcoonNaam;
  label: string;
  waarde: string | null;
}) {
  if (!waarde) return null;
  return (
    <div className="flex items-center gap-2.5 border-b border-line-soft/60 py-1.5 last:border-0">
      <span className="shrink-0 text-muted-soft">
        <Icoon soort={icoon} />
      </span>
      <span className="text-[11px] uppercase tracking-[0.1em] text-muted">{label}</span>
      <span className="ml-auto truncate text-right text-[13px] text-ink/90">{waarde}</span>
    </div>
  );
}

/** Een open antwoord: kopje met icoon, tekst eronder. */
function Veld({
  icoon,
  label,
  waarde,
  nadruk = false,
}: {
  icoon: IcoonNaam;
  label: string;
  waarde: string | null;
  nadruk?: boolean;
}) {
  if (!waarde) return null;
  return (
    <div>
      <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
        <span className="text-muted-soft">
          <Icoon soort={icoon} />
        </span>
        {label}
      </p>
      <p
        className={`mt-1.5 whitespace-pre-wrap pl-[22px] text-sm leading-relaxed ${
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

/** De iconen die op een sollicitatiekaart voorkomen. */
type IcoonNaam =
  | 'check'
  | 'cross'
  | 'discord'
  | 'persoon'
  | 'telefoon'
  | 'klok'
  | 'quote'
  | 'controller'
  | 'kalender';

/**
 * Eén set lijniconen, allemaal op hetzelfde raster van 16 bij 16 en met
 * dezelfde lijndikte. Dat is waarom ze hier met de hand staan in plaats van
 * uit een pakket te komen: geleende iconen hebben elk hun eigen gewicht, en
 * dan oogt een rijtje onder elkaar rommelig.
 */
function Icoon({ soort }: { soort: IcoonNaam }) {
  const gemeenschappelijk = {
    viewBox: '0 0 16 16',
    'aria-hidden': true,
    className: 'h-3.5 w-3.5',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (soort === 'discord') {
    // Het Discord-merkteken is een vlak, geen lijn.
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5" fill="currentColor">
        <path d="M20.3 4.6A19 19 0 0 0 15.6 3l-.3.5a14 14 0 0 1 4 2 13.6 13.6 0 0 0-11.7 0 14 14 0 0 1 4-2L11.4 3A19 19 0 0 0 6.7 4.6C3.7 9 2.9 13.3 3.3 17.5a19 19 0 0 0 5.7 2.9l1.2-1.7a12.3 12.3 0 0 1-1.9-.9l.5-.4a13.6 13.6 0 0 0 11.6 0l.5.4c-.6.4-1.3.7-2 .9l1.2 1.7a19 19 0 0 0 5.8-2.9c.5-4.9-.8-9.1-3.6-12.9ZM9.7 15c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3Zm4.6 0c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3Z" />
      </svg>
    );
  }

  if (soort === 'check' || soort === 'cross') {
    return (
      <svg {...gemeenschappelijk} strokeWidth="2.2">
        {soort === 'check' ? <path d="M3 8.5l3.5 3.5L13 5" /> : <path d="M4 4l8 8M12 4l-8 8" />}
      </svg>
    );
  }

  return (
    <svg {...gemeenschappelijk} strokeWidth="1.5">
      {soort === 'persoon' ? (
        <>
          <circle cx="8" cy="5" r="2.6" />
          <path d="M2.8 14c.6-2.6 2.7-4 5.2-4s4.6 1.4 5.2 4" />
        </>
      ) : null}

      {soort === 'telefoon' ? (
        <>
          <rect x="4.5" y="1.5" width="7" height="13" rx="1.6" />
          <path d="M7 3.2h2" />
          <path d="M7.4 12.3h1.2" />
        </>
      ) : null}

      {soort === 'klok' ? (
        <>
          <circle cx="8" cy="8" r="6.2" />
          <path d="M8 4.4V8l2.4 1.6" />
        </>
      ) : null}

      {soort === 'quote' ? (
        <>
          <path d="M2 12.5V6.8C2 5.2 3.2 4 4.8 4h6.4C12.8 4 14 5.2 14 6.8v2.4c0 1.6-1.2 2.8-2.8 2.8H6l-4 2.5Z" />
        </>
      ) : null}

      {soort === 'controller' ? (
        <>
          <path d="M5.2 4.5h5.6c1.9 0 3.2 1.6 3.4 3.4l.3 2.6c.2 1.4-.9 2.5-2.1 2.1-.8-.3-1.3-.9-1.8-1.6H5.4c-.5.7-1 1.3-1.8 1.6-1.2.4-2.3-.7-2.1-2.1l.3-2.6C2 6.1 3.3 4.5 5.2 4.5Z" />
          <path d="M4.5 7.6v1.8M3.6 8.5h1.8" />
          <path d="M11 7.9h.01M12.2 9.2h.01" strokeWidth="1.8" />
        </>
      ) : null}

      {soort === 'kalender' ? (
        <>
          <rect x="2" y="3.2" width="12" height="11" rx="1.6" />
          <path d="M2 6.6h12M5.4 1.8v2.6M10.6 1.8v2.6" />
        </>
      ) : null}
    </svg>
  );
}
