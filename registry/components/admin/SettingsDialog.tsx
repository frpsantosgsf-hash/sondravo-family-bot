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
            Discord-sync
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-soft">
            Haalt de actuele Discord-naam en avatar op voor elk lid met een Discord user ID.
            Werkt alleen wanneer DISCORD_BOT_TOKEN en DISCORD_GUILD_ID ingesteld zijn.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={runDiscordSync} loading={syncing}>
          Nu synchroniseren
        </Button>
      </div>
    </Modal>
  );
}
