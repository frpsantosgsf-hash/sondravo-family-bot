'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { saveSettingsAction } from '@/lib/actions';
import type { ActionResult, FamilySettings } from '@/types';

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

  /** Zoekt voor elk lid het Discord-account met dezelfde naam. */
  async function runDiscordMatch() {
    setMatching(true);
    try {
      const response = await fetch('/api/discord/match', { method: 'POST' });
      const payload = (await response.json()) as {
        error?: string;
        gekoppeld?: number;
        nietGevonden?: string[];
        meerdereOpties?: string[];
      };

      if (!response.ok) {
        toast(payload.error ?? 'Koppelen mislukt.', 'error');
        return;
      }

      const rest: string[] = [];
      if (payload.nietGevonden?.length) {
        rest.push(`niet gevonden: ${payload.nietGevonden.join(', ')}`);
      }
      if (payload.meerdereOpties?.length) {
        rest.push(`meerdere opties: ${payload.meerdereOpties.join(', ')}`);
      }

      toast(
        `${payload.gekoppeld ?? 0} leden gekoppeld.${rest.length ? ` Nog te doen — ${rest.join('; ')}.` : ''}`,
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
            <strong className="text-ink/80">Koppelen</strong> zoekt voor elk lid het Discord-account
            met dezelfde naam, en zet daarna de foto en @naam automatisch op de lijst. Dat hoef je
            maar één keer te doen.
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
            onClick={runDiscordMatch}
            loading={matching}
            disabled={syncing}
          >
            Koppelen aan Discord
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={runDiscordSync}
            loading={syncing}
            disabled={matching}
          >
            Foto&apos;s bijwerken
          </Button>
        </div>
      </div>
    </Modal>
  );
}
