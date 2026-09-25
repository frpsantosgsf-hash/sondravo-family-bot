import Link from 'next/link';

const PAGINAS = [
  { href: '/lead', label: 'Leadkamer', alleenLead: true },
  { href: '/leden', label: 'Ledenlijst', alleenLead: false },
  { href: '/gangpot', label: 'Gangpot', alleenLead: false },
  { href: '/sollicitaties', label: 'Sollicitaties', alleenLead: false },
] as const;

/**
 * De besloten pagina's, nog een keer, voor op een telefoon.
 *
 * In de balk bovenaan passen ze niet naast het logo, dus daar staan ze pas
 * vanaf tabletbreedte. Zonder deze rij is de gangpot op een telefoon alleen
 * te bereiken door het adres in te typen.
 */
export function MobieleLinks({
  current,
  isAdmin = false,
}: {
  current: (typeof PAGINAS)[number]['href'];
  isAdmin?: boolean;
}) {
  return (
    <nav aria-label="Besloten pagina's" className="mt-5 flex flex-wrap gap-2 sm:hidden">
      {PAGINAS.filter((pagina) => pagina.href !== current && (!pagina.alleenLead || isAdmin)).map(
        (pagina) => (
          <Link
            key={pagina.href}
            href={pagina.href}
            className="tap-target inline-flex items-center rounded-lg border border-line bg-panel-high px-4 text-[13px] uppercase tracking-[0.14em] text-ink transition-colors hover:border-creme/25"
          >
            {pagina.label}
          </Link>
        ),
      )}
    </nav>
  );
}
