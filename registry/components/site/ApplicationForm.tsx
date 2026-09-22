'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { submitApplicationAction } from '@/lib/application-actions';
import type { ActionResult } from '@/types';

export function ApplicationForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    submitApplicationAction,
    null,
  );

  const errors = state?.ok === false ? (state.fieldErrors ?? {}) : {};

  if (state?.ok) {
    return (
      <div
        role="status"
        className="rounded-xl border border-sondravo-green/40 bg-sondravo-green/10 px-5 py-6 text-center"
      >
        <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-creme">Verstuurd</p>
        <p className="mt-2 text-sm leading-relaxed text-ink/80">{state.message}</p>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Je hoort het via Discord. Je hoeft niets meer te doen — nog een keer insturen kan pas
          nadat er naar deze sollicitatie gekeken is.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state?.ok === false ? (
        <p
          role="alert"
          className="rounded-lg border border-sondravo-red/35 bg-sondravo-red/10 px-4 py-3 text-sm leading-relaxed text-[#f2a9ac]"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Je naam"
          name="name"
          required
          maxLength={64}
          autoComplete="off"
          hint="De naam waarmee je in de stad bekend staat."
          error={errors['name']}
        />
        <TextField
          label="Leeftijd"
          name="age"
          type="number"
          min={10}
          max={99}
          inputMode="numeric"
          error={errors['age']}
        />
      </div>

      <TextField
        label="Ingame telefoonnummer"
        name="phone"
        maxLength={32}
        inputMode="tel"
        hint="Optioneel, maar handig als we je willen bereiken."
        error={errors['phone']}
      />

      <TextAreaField
        label="Waarom wil je bij Sondravo?"
        name="motivation"
        required
        rows={5}
        maxLength={2000}
        hint="Minimaal een paar zinnen. Dit is waar we het meest naar kijken."
        error={errors['motivation']}
      />

      <TextAreaField
        label="Ervaring in FiveM"
        name="experience"
        rows={3}
        maxLength={1000}
        hint="Waar heb je eerder gespeeld, en hoe lang speel je al?"
        error={errors['experience']}
      />

      <TextAreaField
        label="Wanneer ben je online?"
        name="availability"
        rows={2}
        maxLength={500}
        hint="Welke dagen en tijden zien we je meestal?"
        error={errors['availability']}
      />

      <div className="flex justify-end pt-1">
        <Button type="submit" variant="primary" loading={pending}>
          Sollicitatie versturen
        </Button>
      </div>
    </form>
  );
}
