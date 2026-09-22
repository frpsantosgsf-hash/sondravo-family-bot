import Image from 'next/image';
import { CapacityMeter } from '@/components/site/CapacityMeter';

interface RegistryHeaderProps {
  familyName: string;
  total: number;
  limit: number;
}

/** De kop van de ledenlijst: merk links, capaciteit rechts. */
export function RegistryHeader({ familyName, total, limit }: RegistryHeaderProps) {
  return (
    <header className="panel panel-sheen relative overflow-hidden">
      {/* Nauwelijks zichtbare gloed, puur om het paneel diepte te geven. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(215,25,32,0.10),transparent)] blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,rgba(14,90,49,0.12),transparent)] blur-2xl"
      />

      <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex items-center gap-4">
          <Image
            src="/sondravo-mark.png"
            alt=""
            width={400}
            height={240}
            priority
            sizes="64px"
            className="h-12 w-auto shrink-0 drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)] sm:h-16"
          />
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold uppercase leading-tight tracking-[0.08em] text-creme sm:text-2xl">
              {familyName}
            </h1>
            <p className="mt-1 text-[11px] uppercase tracking-[0.28em] text-muted">
              Official Family Registry
            </p>
          </div>
        </div>

        <div className="sm:shrink-0">
          <CapacityMeter total={total} limit={limit} />
        </div>
      </div>
    </header>
  );
}
