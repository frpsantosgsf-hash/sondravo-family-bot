import { geld, korteDatum, weeknummer } from '@/lib/weken';
import type { PotData } from '@/types';

interface Cijfer {
  label: string;
  waarde: number;
  toon: 'neutraal' | 'groen' | 'rood';
  uitleg: string;
}

/**
 * De kop van de gangpot: één groot getal en vier kleine eronder.
 *
 * "Nog te betalen" staat er bewust apart bij en niet in het saldo verwerkt.
 * Dat geld zit nog in andermans zak, en een kas die alvast meetelt wat er nog
 * moet komen is precies hoe je onbedoeld rood komt te staan.
 */
export function SaldoKaart({ data }: { data: PotData }) {
  const { totals, weeklyAmount, currentFriday, members } = data;

  /*
   * Dezelfde vier getallen als de tabbladen van het oude bestand, zodat je ze
   * naast elkaar kunt leggen. Bijdragen en inkomsten staan apart en niet
   * opgeteld: het zijn twee heel verschillende stromen, en samengevoegd zie je
   * niet meer of de pot van de wekelijkse inleg leeft of van wat er binnenkomt.
   */
  const cijfers: Cijfer[] = [
    {
      label: 'Bijdragen',
      waarde: totals.contributions,
      toon: 'groen',
      uitleg: 'Wekelijkse inleg',
    },
    {
      label: 'Inkomsten',
      waarde: totals.income,
      toon: 'groen',
      uitleg: 'Erbij buiten de inleg om',
    },
    {
      label: 'Uitgegeven',
      waarde: totals.expenses,
      toon: 'rood',
      uitleg: 'Betaald uit de pot',
    },
    {
      label: 'Nog te betalen',
      waarde: totals.outstanding,
      toon: 'rood',
      uitleg: 'Zit nog niet in het saldo',
    },
  ];

  return (
    <section
      aria-labelledby="saldo-kop"
      className="panel panel-sheen overflow-hidden border border-line"
    >
      <div className="border-b border-line/70 bg-[#0e1a12] px-5 py-6 sm:px-7 sm:py-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#7ddba3]/70">
          Elke vrijdag · ieder lid · één pot
        </p>

        <h2 id="saldo-kop" className="sr-only">
          Actueel saldo
        </h2>

        <p className="mt-3 font-display text-4xl leading-none tracking-[0.02em] text-[#a8f0c6] tabular-nums sm:text-5xl">
          {geld(totals.balance)}
        </p>

        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          {members.length} {members.length === 1 ? 'lid' : 'leden'} · {geld(weeklyAmount)} per
          vrijdag · huidige week {weeknummer(currentFriday)} ({korteDatum(currentFriday)})
          {/* Het beginsaldo hoort alleen in beeld wanneer het er is. Een tegel
              met een nul erin vraagt aandacht voor niets. */}
          {totals.opening > 0 ? ` · beginsaldo ${geld(totals.opening)}` : ''}
        </p>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-y divide-line/70 border-line/70 sm:grid-cols-4 sm:divide-y-0">
        {cijfers.map((cijfer) => (
          <div key={cijfer.label} className="px-4 py-4 sm:px-5 sm:py-5">
            <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
              {cijfer.label}
            </dt>
            <dd
              className={`mt-1.5 font-display text-lg tabular-nums sm:text-xl ${
                cijfer.toon === 'groen'
                  ? 'text-[#7ddba3]'
                  : cijfer.toon === 'rood'
                    ? 'text-[#f2a9ac]'
                    : 'text-creme'
              }`}
            >
              {geld(cijfer.waarde)}
            </dd>
            <p className="mt-1 text-[11px] leading-snug text-muted-soft">{cijfer.uitleg}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}
