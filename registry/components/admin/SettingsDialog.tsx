'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { saveSettingsAction } from '@/lib/actions';
import type { ActionResult, FamilySettings } from '@/types';

/** Wat het koppelen heeft gedaan, en wat er nog handwerk is. */
interface MatchReport {
  gekoppeld?: number;
  discordLeden?: number;
  viaGelijkenis?: string[];
  nietGevonden?: string[];
  meerdereOpties?: string[];
  overgeslagen?: string[];
}

/** Uitslag van de rol-import. */
interface ImportReport {
  metFamilierol?: number;
  toegevoegd?: string[];
  rangAangepast?: string[];
  ongewijzigd?: number;
  zonderRangrol?: string[];
  zonderFamilierol?: string[];
  mislukt?: string[];
}

function ReportList({ label, hint, names }: { label: string; hint: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {label} ({names.length})
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-soft">{hint}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink/75">{names.join(' · ')}</p>
    </div>
  );
}

interface SettingsDialogProps {
  open: boolean;
  settings: FamilySettings;
  memberCount: number;
  onClose: () => void;
}

export function SettingsDialog({ open, settings, memberCount, onClose }: SettingsDialogProps) {
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveSettingsAction,
    null,
  );
  const handledRef = useRef<ActionResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [matching, setMatching] = useState(false);
  /**
   * De uitslag van het koppelen blijft in beeld staan. Een toast glijdt weg
   * voordat je de namen gelezen hebt, en juist die namen heb je nodig om de
   * laatste leden met de hand te koppelen.
   */
  const [matchReport, setMatchReport] = useState<MatchReport | null>(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);

  useEffect(() => {
    if (!state || state === handledRef.current) return;
    handledRef.current = state;

    if (state.ok) {
      toast(state.message, 'success');
      onClose();
    } else if (!state.fieldErrors) {
      toast(state.error, 'error');
    }
  }, [state, toast, onClose]);

  /** Bouwt de ledenlijst op uit de Discord-rollen. */
  async function runDiscordImport() {
    setImporting(true);
    setImportReport(null);
    setMatchReport(null);
    try {
      const response = await fetch('/api/discord/import', { method: 'POST' });
      const payload = (await response.json()) as ImportReport & { error?: string };

      if (!response.ok) {
        toast(payload.error ?? 'Importeren mislukt.', 'error');
        return;
      }

      setImportReport(payload);
      toast(
        `${payload.metFamilierol ?? 0} leden met de familierol verwerkt.`,
        payload.metFamilierol ? 'success' : 'info',
      );
    } catch {
      toast('Importeren mislukt. Probeer het later opnieuw.', 'error');
    } finally {
      setImporting(false);
    }
  }

  /** Zoekt voor elk lid het Discord-account met dezelfde naam. */
  async function runDiscordMatch() {
    setMatching(true);
    setMatchReport(null);
    try {
      const response = await fetch('/api/discord/match', { method: 'POST' });
      const payload = (await response.json()) as MatchReport & { error?: string };

      if (!response.ok) {
        toast(payload.error ?? 'Koppelen mislukt.', 'error');
        return;
      }

      setMatchReport(payload);
      toast(
        `${payload.gekoppeld ?? 0} leden gekoppeld van de ${payload.discordLeden ?? 0} in je Discord-server.`,
        payload.gekoppeld ? 'success' : 'info',
      );
    } catch {
      toast('Koppelen mislukt. Probeer het later opnieuw.', 'error');
    } finally {
      setMatching(false);
    }
  }

  async function runDiscordSync() {
    setSyncing(true);
    try {
      const response = await fetch('/api/discord/sync', { method: 'POST' });
      const payload = (await response.json()) as {
        error?: string;
        updated?: number;
        checked?: number;
        leftServer?: string[];
      };

      if (!response.ok) {
        toast(payload.error ?? 'Sync mislukt.', 'error');
        return;
      }

      const left = payload.leftServer?.length
        ? ` Niet meer in de server: ${payload.leftServer.join(', ')}.`
        : '';
      toast(`${payload.updated ?? 0} van ${payload.checked ?? 0} leden bijgewerkt.${left}`, 'success');
    } catch {
      toast('Sync mislukt. Probeer het later opnieuw.', 'error');
    } finally {
      setSyncing(false);
    }
  }

  const errors = state?.ok === false ? (state.fieldErrors ?? {}) : {};

  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : onClose}
      title="Instellingen"
      description="Capaciteit en naam van de familie."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Annuleren
          </Button>
          <Button type="submit" form="settings-form" variant="primary" loading={pending}>
            Opslaan
          </Button>
        </div>
      }
    >
      <form id="settings-form" action={formAction} className="space-y-4">
        <TextField
          label="Familienaam"
          name="familyName"
          required
          maxLength={64}
          defaultValue={settings.familyName}
          error={errors['familyName']}
        />

        <TextField
          label="Maximale leden"
          name="memberLimit"
          type="number"
          min={1}
          max={500}
          required
          defaultValue={String(settings.memberLimit)}
          hint={`Er staan nu ${memberCount} leden in het register.`}
          error={errors['memberLimit']}
        />
      </form>

      <div className="mt-6 space-y-3 border-t border-line pt-5">
        <div>
          <h3 className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
            Discord
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-soft">
            <strong className="text-ink/80">Uit rollen halen</strong> bouwt de lijst op uit je
            Discord-server: iedereen met de familierol komt erop, en zijn rangrol bepaalt zijn
            plek. Dit is de betrouwbaarste manier — er wordt niet op namen gegokt.
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-soft">
            <strong className="text-ink/80">Koppelen</strong> zoekt voor elk lid het Discord-account
            met dezelfde naam. Alleen nodig voor leden die je met de hand hebt toegevoegd.
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-soft">
            <strong className="text-ink/80">Bijwerken</strong> haalt daarna nieuwe foto&apos;s en
            naamswijzigingen op voor de leden die al gekoppeld zijn.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={runDiscordImport}
            loading={importing}
            disabled={matching || syncing}
          >
            Uit rollen halen
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={runDiscordMatch}
            loading={matching}
            disabled={importing || syncing}
          >
            Koppelen aan Discord
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={runDiscordSync}
            loading={syncing}
            disabled={importing || matching}
          >
            Foto&apos;s bijwerken
          </Button>
        </div>

        {importReport ? (
          <div className="space-y-3 rounded-lg border border-line bg-panel-high p-3">
            <p className="text-xs text-ink/80">
              {importReport.metFamilierol ?? 0} leden met de familierol gevonden.{' '}
              {importReport.ongewijzigd ?? 0} stonden al goed.
            </p>
            <ReportList
              label="Toegevoegd"
              hint="Deze stonden nog niet op de lijst en zijn er nu bij gezet."
              names={importReport.toegevoegd ?? []}
            />
            <ReportList
              label="Rang aangepast"
              hint="De rangrol in Discord week af van de lijst. De Discord-rol wint."
              names={importReport.rangAangepast ?? []}
            />
            <ReportList
              label="Geen rangrol"
              hint="Wel de familierol, maar geen rangrol. Deze staan nu op de laagste rang — geef ze een rangrol in Discord en draai dit nog eens."
              names={importReport.zonderRangrol ?? []}
            />
            <ReportList
              label="Familierol kwijt"
              hint="Staan wel op de lijst, maar dragen de familierol niet meer. Er is niemand verwijderd — dat beslis jij."
              names={importReport.zonderFamilierol ?? []}
            />
            <ReportList
              label="Mislukt"
              hint="Deze konden niet worden opgeslagen. Probeer het nog eens; blijft het misgaan, koppel ze dan met de hand."
              names={importReport.mislukt ?? []}
            />
          </div>
        ) : null}

        {matchReport ? (
          <div className="space-y-3 rounded-lg border border-line bg-panel-high p-3">
            <p className="text-xs text-ink/80">
              {matchReport.gekoppeld ?? 0} leden gekoppeld, uit {matchReport.discordLeden ?? 0}{' '}
              accounts in je Discord-server.
            </p>
            <ReportList
              label="Op gelijkenis gekoppeld"
              hint="De naam kwam niet exact overeen. Even nalopen of dit klopt."
              names={matchReport.viaGelijkenis ?? []}
            />
            <ReportList
              label="Niet gevonden"
              hint="Geen account met deze naam in de server. Pas de bijnaam in Discord aan, of vul het Discord user ID met de hand in via het potloodje."
              names={matchReport.nietGevonden ?? []}
            />
            <ReportList
              label="Meerdere opties"
              hint="Meer dan één account past bij deze naam, dus deze zijn met rust gelaten. Handmatig koppelen via het potloodje."
              names={matchReport.meerdereOpties ?? []}
            />
            <ReportList
              label="Al gekoppeld"
              hint="Deze hadden al een Discord-account en zijn niet aangeraakt. Klopt er eentje niet, pas hem dan aan via het potloodje."
              names={matchReport.overgeslagen ?? []}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
