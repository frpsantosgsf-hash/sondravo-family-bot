'use client';

import { useState } from 'react';
import { ApplicationsBoard } from '@/components/applications/ApplicationsBoard';

/**
 * Het overzicht met, voor een Lead, een tabblad naar het archief.
 *
 * Leden zien alleen de openstaande sollicitaties — het archief bevat
 * afgehandelde zaken over echte mensen en hoort bij de leiding te blijven.
 */
export function ApplicationsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<'open' | 'archief'>('open');

  if (!isAdmin) return <ApplicationsBoard />;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sollicitaties"
        className="mb-5 inline-flex rounded-lg border border-line bg-panel p-1"
      >
        <Tab actief={tab === 'open'} onClick={() => setTab('open')}>
          Openstaand
        </Tab>
        <Tab actief={tab === 'archief'} onClick={() => setTab('archief')}>
          Archief
        </Tab>
      </div>

      {/* De sleutel forceert een verse component bij het wisselen, zodat de
          lijst opnieuw wordt opgehaald in plaats van de oude te tonen. */}
      <ApplicationsBoard key={tab} archief={tab === 'archief'} />
    </div>
  );
}

function Tab({
  actief,
  onClick,
  children,
}: {
  actief: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={actief}
      onClick={onClick}
      className={`tap-target rounded-md px-4 text-[12px] font-medium uppercase tracking-[0.14em] transition-colors ${
        actief ? 'bg-creme/10 text-creme' : 'text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
