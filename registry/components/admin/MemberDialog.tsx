'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { saveMemberAction } from '@/lib/actions';
import type { ActionResult, Rank, RegistryMember } from '@/types';

interface MemberDialogProps {
  open: boolean;
  /** `null` = nieuw lid toevoegen. */
  member: RegistryMember | null;
  ranks: Rank[];
  defaultRank: string;
  onClose: () => void;
}

export function MemberDialog({ open, member, ranks, defaultRank, onClose }: MemberDialogProps) {
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveMemberAction,
    null,
  );

  const handledRef = useRef<ActionResult | null>(null);

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

  const errors = state?.ok === false ? (state.fieldErrors ?? {}) : {};
  const isEdit = Boolean(member);

  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={isEdit ? `${member?.name} bewerken` : 'Lid toevoegen'}
      description={
        isEdit
          ? 'Pas de gegevens aan. Een rangwijziging verplaatst het lid meteen naar de juiste groep.'
          : 'Vul minimaal een naam en een rang in. De rest mag later.'
      }
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Annuleren
          </Button>
          <Button type="submit" form="member-form" variant="primary" loading={pending}>
            {isEdit ? 'Wijzigingen opslaan' : 'Lid toevoegen'}
          </Button>
        </div>
      }
    >
      <form id="member-form" action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={member?.id ?? ''} />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Naam"
            name="name"
            required
            maxLength={64}
            defaultValue={member?.name ?? ''}
            placeholder="Lahaye"
            hint="Wordt getoond als SDF | Naam"
            error={errors['name']}
            autoComplete="off"
          />

          <SelectField
            label="Rang"
            name="rank"
            required
            defaultValue={member?.rank ?? defaultRank}
            error={errors['rank']}
          >
            {ranks.map((rank) => (
              <option key={rank.key} value={rank.key}>
                {rank.label}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Discord username"
            name="discordUsername"
            maxLength={64}
            defaultValue={member?.discordUsername ?? ''}
            placeholder="lahaye"
            hint="Zonder @"
            error={errors['discordUsername']}
            autoComplete="off"
          />

          <TextField
            label="Discord user ID"
            name="discordUserId"
            inputMode="numeric"
            defaultValue={member?.discordUserId ?? ''}
            placeholder="123456789012345678"
            hint="Privé — nooit publiek zichtbaar"
            error={errors['discordUserId']}
            autoComplete="off"
          />

          <TextField
            label="Ingame telefoon"
            name="phone"
            maxLength={32}
            defaultValue={member?.phone ?? ''}
            placeholder="555-0147"
            error={errors['phone']}
            autoComplete="off"
          />

          <TextField
            label="Join datum"
            name="joinedAt"
            type="date"
            defaultValue={member?.joinedAt ?? ''}
            error={errors['joinedAt']}
          />
        </div>

        <TextField
          label="Avatar URL"
          name="avatarUrl"
          type="url"
          maxLength={512}
          defaultValue={member?.avatarUrl ?? ''}
          placeholder="https://cdn.discordapp.com/avatars/..."
          hint="Leeg laten geeft nette initialen als terugval."
          error={errors['avatarUrl']}
          autoComplete="off"
        />

        <TextAreaField
          label="Interne notitie"
          name="internalNote"
          maxLength={2000}
          defaultValue={member?.internalNote ?? ''}
          placeholder="Alleen zichtbaar voor Lead/Admin."
          hint="Staat in een aparte, afgeschermde tabel en komt nooit op de publieke pagina."
          error={errors['internalNote']}
        />

        {state?.ok === false && state.fieldErrors ? (
          <p role="alert" className="text-sm text-[#f2a9ac]">
            {state.error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
