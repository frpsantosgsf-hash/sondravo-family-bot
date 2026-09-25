'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { vandaag } from '@/lib/weken';

export interface Boeking {
  date: string;
  description: string;
  who: string;
  amount: string;
  note: string;
}

interface BoekingDialogProps {
  soort: 'expense' | 'income';
  onClose: () => void;
  onOpslaan: (soort: 'expense' | 'income', waarden: Boeking) => Promise<boolean>;
}

/**
 * Een uitgave of inkomst boeken. Alleen de Lead komt hier.
 *
 * Dit venster wordt pas gemaakt wanneer het opengaat en weer weggegooid als
 * het sluit. Daardoor staat er nooit een half ingevuld formulier van de
 * vorige keer in, zonder dat er een effect aan te pas hoeft te komen.
 */
export function BoekingDialog({ soort, onClose, onOpslaan }: BoekingDialogProps) {
  const [waarden, setWaarden] = useState<Boeking>(() => ({
    date: vandaag(),
    description: '',
    who: '',
    amount: '',
    note: '',
  }));
  // Per veld, zodat de melding staat waar de fout zit.
  const [fouten, setFouten] = useState<{ description?: string; amount?: string }>({});
  const [bezig, setBezig] = useState(false);

  const isUitgave = soort === 'expense';

  async function opslaan() {
    // Punten en spaties zijn hoe je 1.000.000 intypt; die horen niet als fout
    // terug te komen.
    const bedrag = Number(waarden.amount.replace(/[.\s]/g, '').replace(',', '.'));

    const gevonden = {
      description: waarden.description.trim() ? undefined : 'Vul een omschrijving in.',
      amount:
        Number.isFinite(bedrag) && bedrag > 0 ? undefined : 'Vul een bedrag hoger dan nul in.',
    };

    if (gevonden.description || gevonden.amount) {
      setFouten(gevonden);
      return;
    }

    setBezig(true);
    setFouten({});
    const gelukt = await onOpslaan(soort, { ...waarden, amount: String(Math.round(bedrag)) });
    setBezig(false);

    if (gelukt) onClose();
  }

  return (
    <Modal
      open
      onClose={bezig ? () => undefined : onClose}
      title={isUitgave ? 'Uitgave boeken' : 'Inkomst boeken'}
      description={
        isUitgave
          ? 'Geld dat daadwerkelijk uit de pot betaald is.'
          : 'Geld dat in de pot kwam buiten de wekelijkse bijdragen om.'
      }
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={bezig}>
            Annuleren
          </Button>
          <Button type="button" variant="primary" onClick={opslaan} loading={bezig}>
            Boeken
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Datum"
          type="date"
          value={waarden.date}
          max={vandaag()}
          onChange={(event) => setWaarden({ ...waarden, date: event.target.value })}
        />

        <TextField
          label="Omschrijving"
          placeholder={isUitgave ? '5 x melee' : 'Verkoop wapens'}
          value={waarden.description}
          maxLength={200}
          error={fouten.description}
          onChange={(event) => setWaarden({ ...waarden, description: event.target.value })}
        />

        <TextField
          label={isUitgave ? 'Betaald door' : 'Bron'}
          placeholder={isUitgave ? 'Rick' : 'Deal met Zazavao'}
          value={waarden.who}
          maxLength={120}
          onChange={(event) => setWaarden({ ...waarden, who: event.target.value })}
        />

        <TextField
          label="Bedrag"
          inputMode="numeric"
          placeholder="1.000.000"
          value={waarden.amount}
          onChange={(event) => setWaarden({ ...waarden, amount: event.target.value })}
          hint="In-game geld. Punten mag je gewoon meetypen."
          error={fouten.amount}
        />

        <TextAreaField
          label="Opmerking of bewijs"
          rows={3}
          placeholder="Optioneel"
          value={waarden.note}
          maxLength={500}
          onChange={(event) => setWaarden({ ...waarden, note: event.target.value })}
        />
      </div>
    </Modal>
  );
}
