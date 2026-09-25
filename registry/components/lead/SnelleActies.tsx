'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

/** Alleen de velden die deze knop gebruikt; de rest staat in het venster bij de ledenlijst. */
interface ImportRapport {
  metFamilierol?: number;
  toegevoegd?: string[];
  overgenomen?: string[];
  rangAangepast?: string[];
  verwijderd?: string[];
  meerdereOpties?: string[];
  error?: string;
}

/**
 * De drie knoppen die een Lead echt gebruikt.
 *
 * Ze staan hier bij elkaar omdat ze anders in drie verschillende schermen
 * verstopt zitten: de rollen-sync in een instellingenvenster, de deur bij de
 * sollicitaties en het Discord-bericht nergens.
 */
export function SnelleActies({ sollicitatiesOpen }: { sollicitatiesOpen: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [bezig, setBezig] = useState<'rollen' | 'deur' | 'discord' | null>(null);
  const [rapport, setRapport] = useState<string | null>(null);
  const [open, setOpen] = useState(sollicitatiesOpen);

  /** Maakt de ledenlijst gelijk aan wie de familierol draagt. */
  async function haalRollenOp() {
    setBezig('rollen');
    setRapport(null);

    try {
      const response = await fetch('/api/discord/import', { method: 'POST' });
      const payload = (await response.json()) as ImportRapport;

      if (!response.ok) {
        toast(payload.error ?? 'Ophalen mislukt.', 'error');
        return;
      }

      // Alleen benoemen wat er veranderd is. "0 toegevoegd, 0 verwijderd" is
      // ruis; "niets veranderd" is het antwoord.
      const delen: string[] = [];
      if (payload.toegevoegd?.length) delen.push(`${payload.toegevoegd.length} erbij`);
      if (payload.verwijderd?.length) delen.push(`${payload.verwijderd.length} eruit`);
      if (payload.rangAangepast?.length) {
        delen.push(`${payload.rangAangepast.length} van rang gewijzigd`);
      }
      if (payload.overgenomen?.length) {
        delen.push(`${payload.overgenomen.length} gekoppeld aan Discord`);
      }
      if (payload.meerdereOpties?.length) {
        delen.push(`${payload.meerdereOpties.length} overgeslagen (naam niet eenduidig)`);
      }

      setRapport(
        delen.length > 0
          ? `${payload.metFamilierol ?? 0} met de familierol — ${delen.join(', ')}.`
          : `${payload.metFamilierol ?? 0} met de familierol — er was niets te veranderen.`,
      );
      toast('Ledenlijst bijgewerkt.', 'success');
      startTransition(() => router.refresh());
    } catch {
      toast('Ophalen mislukt. Probeer het later opnieuw.', 'error');
    } finally {
      setBezig(null);
    }
  }

  /** Zet de deur voor nieuwe sollicitaties open of dicht. */
  async function zetDeur(nieuweStand: boolean) {
    setBezig('deur');

    try {
      const response = await fetch('/api/settings/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ open: nieuweStand }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        toast(payload.error ?? 'Bijwerken mislukt.', 'error');
        return;
      }

      setOpen(nieuweStand);
      toast(nieuweStand ? 'Sollicitaties staan open.' : 'Sollicitaties zijn gesloten.', 'success');
      startTransition(() => router.refresh());
    } catch {
      toast('Bijwerken mislukt.', 'error');
    } finally {
      setBezig(null);
    }
  }

  /** Plaatst of ververst het gangpot-bericht in Discord. */
  async function stuurGangpot() {
    setBezig('discord');

    try {
      const response = await fetch('/api/gangpot/reminder', { method: 'POST' });
      const payload = (await response.json()) as { resultaat?: string; error?: string };

      if (!response.ok) {
        toast(payload.error ?? 'Versturen mislukt.', 'error');
        return;
      }

      toast(
        payload.resultaat === 'geplaatst'
          ? 'Bericht geplaatst in Discord.'
          : payload.resultaat === 'bijgewerkt'
            ? 'Het bestaande bericht is bijgewerkt.'
            : 'Er is geen webhook ingesteld, dus er ging niets naar Discord.',
        payload.resultaat === 'overgeslagen' ? 'info' : 'success',
      );
    } catch {
      toast('Versturen mislukt.', 'error');
    } finally {
      setBezig(null);
    }
  }

  return (
    <div className="panel divide-y divide-line/60 overflow-hidden border border-line">
      <Rij
        titel="Rollen ophalen"
        uitleg="Maakt de ledenlijst en de rangen gelijk aan Discord."
        knop={
          <Button
            size="sm"
            variant="secondary"
            onClick={haalRollenOp}
            loading={bezig === 'rollen'}
            disabled={bezig !== null}
          >
            Ophalen
          </Button>
        }
        onder={rapport}
      />

      <Rij
        titel="Sollicitaties"
        uitleg={
          open ? 'Staan open voor nieuwe aanmeldingen.' : 'Staan dicht. Niemand kan zich aanmelden.'
        }
        knop={
          <Button
            size="sm"
            variant={open ? 'secondary' : 'primary'}
            onClick={() => zetDeur(!open)}
            loading={bezig === 'deur'}
            disabled={bezig !== null}
          >
            {open ? 'Sluiten' : 'Openen'}
          </Button>
        }
      />

      <Rij
        titel="Gangpot in Discord"
        uitleg="Plaatst het bericht van deze week, of werkt het bestaande bij."
        knop={
          <Button
            size="sm"
            variant="secondary"
            onClick={stuurGangpot}
            loading={bezig === 'discord'}
            disabled={bezig !== null}
          >
            Versturen
          </Button>
        }
      />
    </div>
  );
}

function Rij({
  titel,
  uitleg,
  knop,
  onder,
}: {
  titel: string;
  uitleg: string;
  knop: React.ReactNode;
  onder?: string | null;
}) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{titel}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{uitleg}</p>
        </div>
        <div className="shrink-0">{knop}</div>
      </div>

      {onder ? (
        <p className="mt-3 rounded-lg border border-line bg-void/50 px-3 py-2 text-[12px] leading-relaxed text-muted">
          {onder}
        </p>
      ) : null}
    </div>
  );
}
