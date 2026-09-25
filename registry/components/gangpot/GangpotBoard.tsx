'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { SaldoKaart } from '@/components/gangpot/SaldoKaart';
import { WeekLijst } from '@/components/gangpot/WeekLijst';
import { Kasboek } from '@/components/gangpot/Kasboek';
import { Geschiedenis } from '@/components/gangpot/Geschiedenis';
import { BoekingDialog, type Boeking } from '@/components/gangpot/BoekingDialog';
import { InstellingenDialog } from '@/components/gangpot/InstellingenDialog';
import { geld } from '@/lib/weken';
import type { PotData, PotEntry, Rank } from '@/types';

type Tab = 'week' | 'kasboek' | 'geschiedenis';

const TABS: { key: Tab; label: string }[] = [
  { key: 'week', label: 'Deze week' },
  { key: 'kasboek', label: 'Kasboek' },
  { key: 'geschiedenis', label: 'Historie' },
];

export function GangpotBoard({ initial, ranks }: { initial: PotData; ranks: Rank[] }) {
  const { toast } = useToast();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>('week');
  const [vrijdag, setVrijdag] = useState(initial.currentFriday);
  const [bezigLid, setBezigLid] = useState<string | null>(null);
  const [boeking, setBoeking] = useState<'expense' | 'income' | null>(null);
  const [instellingen, setInstellingen] = useState(false);
  const [teVerwijderen, setTeVerwijderen] = useState<{
    soort: 'expense' | 'income';
    regel: PotEntry;
  } | null>(null);

  /**
   * Haalt de gangpot opnieuw op, of null als dat niet lukte.
   *
   * Bewust null en geen lege pot: bij een haperende verbinding hoort er niet
   * ineens een saldo van nul en een lege ledenlijst op het scherm te staan.
   */
  const ververs = useCallback(async () => {
    try {
      const response = await fetch('/api/gangpot', { cache: 'no-store' });
      const payload = (await response.json()) as PotData & { error?: string };

      if (!response.ok) {
        toast(payload.error ?? 'Kon de gangpot niet ophalen.', 'error');
        return;
      }

      setData(payload);
    } catch {
      toast('Kon de gangpot niet ophalen.', 'error');
    }
  }, [toast]);

  /** Stuurt één wijziging en vertelt of hij geslaagd is. */
  const verstuur = useCallback(
    async (payload: Record<string, unknown>, fallback: string): Promise<boolean> => {
      try {
        const response = await fetch('/api/gangpot', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const antwoord = (await response.json()) as { error?: string };

        if (!response.ok) {
          toast(antwoord.error ?? fallback, 'error');
          return false;
        }

        await ververs();
        return true;
      } catch {
        toast(fallback, 'error');
        return false;
      }
    },
    [toast, ververs],
  );

  async function toggle(memberId: string, betaald: boolean) {
    setBezigLid(memberId);
    const gelukt = await verstuur(
      { action: 'contribution', memberId, friday: vrijdag, paid: betaald },
      'Bijwerken lukte niet.',
    );
    setBezigLid(null);

    if (gelukt) {
      toast(betaald ? 'Afgevinkt als betaald.' : 'Weer op open gezet.', 'success');
    }
  }

  async function boek(soort: 'expense' | 'income', waarden: Boeking) {
    const gelukt = await verstuur(
      {
        action: soort,
        date: waarden.date,
        description: waarden.description.trim(),
        who: waarden.who.trim() || undefined,
        amount: Number(waarden.amount),
        note: waarden.note.trim() || undefined,
      },
      'Boeken lukte niet.',
    );

    if (gelukt) toast(soort === 'expense' ? 'Uitgave geboekt.' : 'Inkomst geboekt.', 'success');
    return gelukt;
  }

  return (
    <div className="space-y-6">
      <SaldoKaart data={data} />

      <div className="flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Onderdelen van de gangpot"
          className="panel flex min-w-0 flex-1 gap-1 border border-line p-1"
        >
          {TABS.map((item) => (
            <button
              key={item.key}
              role="tab"
              type="button"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`tap-target min-w-0 flex-1 truncate rounded-lg px-1.5 text-[12px] font-medium uppercase tracking-[0.02em] transition-colors sm:px-2 sm:text-[13px] sm:tracking-[0.14em] ${
                tab === item.key
                  ? 'bg-creme/10 text-creme'
                  : 'text-muted hover:bg-panel-high hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {data.isAdmin ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setInstellingen(true)}
            aria-label="Instellingen van de gangpot"
          >
            <Tandwiel />
            <span className="sr-only sm:not-sr-only">Instellingen</span>
          </Button>
        ) : null}
      </div>

      {tab === 'week' ? (
        <WeekLijst
          data={data}
          ranks={ranks}
          vrijdag={vrijdag}
          onVrijdag={setVrijdag}
          onToggle={toggle}
          bezig={bezigLid}
        />
      ) : tab === 'kasboek' ? (
        <Kasboek
          expenses={data.expenses}
          income={data.income}
          isAdmin={data.isAdmin}
          onToevoegen={setBoeking}
          onVerwijderen={(soort, regel) => setTeVerwijderen({ soort, regel })}
        />
      ) : (
        <Geschiedenis data={data} ranks={ranks} />
      )}

      {boeking ? (
        <BoekingDialog soort={boeking} onClose={() => setBoeking(null)} onOpslaan={boek} />
      ) : null}

      {instellingen ? (
        <InstellingenDialog
          openingBalance={data.openingBalance}
          weeklyAmount={data.weeklyAmount}
          onClose={() => setInstellingen(false)}
          onOpslaan={async (openingBalance, weeklyAmount) => {
            const gelukt = await verstuur(
              { action: 'settings', openingBalance, weeklyAmount },
              'Opslaan lukte niet.',
            );
            if (gelukt) toast('Instellingen opgeslagen.', 'success');
            return gelukt;
          }}
        />
      ) : null}

      <ConfirmDialog
        open={teVerwijderen !== null}
        title={teVerwijderen?.soort === 'income' ? 'Inkomst verwijderen' : 'Uitgave verwijderen'}
        description={
          teVerwijderen
            ? `"${teVerwijderen.regel.description}" van ${geld(teVerwijderen.regel.amount)} wordt uit het kasboek gehaald. Het saldo past zich meteen aan.`
            : ''
        }
        confirmLabel="Verwijderen"
        onClose={() => setTeVerwijderen(null)}
        onConfirm={async () => {
          if (!teVerwijderen) return;
          const gelukt = await verstuur(
            { action: 'delete', kind: teVerwijderen.soort, id: teVerwijderen.regel.id },
            'Verwijderen lukte niet.',
          );
          if (gelukt) toast('Regel verwijderd.', 'success');
          setTeVerwijderen(null);
        }}
      />
    </div>
  );
}

function Tandwiel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M19.4 14.5a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1h.2a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
