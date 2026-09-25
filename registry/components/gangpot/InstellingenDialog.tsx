'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { geld } from '@/lib/weken';

interface InstellingenDialogProps {
  openingBalance: number;
  weeklyAmount: number;
  onClose: () => void;
  onOpslaan: (openingBalance: number, weeklyAmount: number) => Promise<boolean>;
}

function leesBedrag(waarde: string): number {
  return Number(waarde.replace(/[.\s]/g, '').replace(',', '.'));
}

/**
 * Beginsaldo en wekelijkse bijdrage. Alleen de Lead.
 *
 * Wordt pas gemaakt bij het openen, zodat de velden altijd de stand van dat
 * moment tonen.
 */
export function InstellingenDialog({
  openingBalance,
  weeklyAmount,
  onClose,
  onOpslaan,
}: InstellingenDialogProps) {
  const [begin, setBegin] = useState(() => geld(openingBalance));
  const [week, setWeek] = useState(() => geld(weeklyAmount));
  const [fouten, setFouten] = useState<{ begin?: string; week?: string }>({});
  const [bezig, setBezig] = useState(false);

  async function opslaan() {
    const beginBedrag = leesBedrag(begin);
    const weekBedrag = leesBedrag(week);

    const gevonden = {
      begin:
        Number.isFinite(beginBedrag) && beginBedrag >= 0 ? undefined : 'Vul een geldig bedrag in.',
      week:
        Number.isFinite(weekBedrag) && weekBedrag > 0
          ? undefined
          : 'De bijdrage moet hoger zijn dan nul.',
    };

    if (gevonden.begin || gevonden.week) {
      setFouten(gevonden);
      return;
    }

    setBezig(true);
    setFouten({});
    const gelukt = await onOpslaan(Math.round(beginBedrag), Math.round(weekBedrag));
    setBezig(false);

    if (gelukt) onClose();
  }

  return (
    <Modal
      open
      onClose={bezig ? () => undefined : onClose}
      title="Instellingen gangpot"
      description="Geldt voor de hele familie."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={bezig}>
            Annuleren
          </Button>
          <Button type="button" variant="primary" onClick={opslaan} loading={bezig}>
            Opslaan
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Beginsaldo"
          inputMode="numeric"
          value={begin}
          error={fouten.begin}
          onChange={(event) => setBegin(event.target.value)}
          hint="Wat er in de pot zat vóór deze administratie begon. Vul dit één keer in."
        />

        <TextField
          label="Bijdrage per vrijdag"
          inputMode="numeric"
          value={week}
          error={fouten.week}
          onChange={(event) => setWeek(event.target.value)}
          hint="Wat ieder lid elke vrijdag inlegt. Al afgevinkte weken houden hun oude bedrag."
        />
      </div>
    </Modal>
  );
}
