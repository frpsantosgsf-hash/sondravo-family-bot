import Link from 'next/link';
import { Wordmark } from '@/components/site/Wordmark';
import { AuthControls } from '@/components/site/AuthControls';
import type { Viewer } from '@/types';

interface SiteNavProps {
  viewer: Viewer | null;
  /** Huidige pagina, bepaalt de actieve link en waar login naartoe stuurt. */
  current: '/' | '/leden' | '/solliciteren';
  /** De ledenlijst staat alleen in het menu voor wie hem ook mag openen. */
  showRegistry?: boolean;
}

export function SiteNav({ viewer, current, showRegistry = true }: SiteNavProps) {
  return (
    <div className="sticky top-0 z-30 border-b border-line/70 bg-void/80 backdrop-blur-xl">
      <nav
        aria-label="Hoofdnavigatie"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6"
      >
        <Link
          href="/"
          className="min-w-0 rounded-lg transition-opacity hover:opacity-85"
          aria-label="The Sondravo Family — naar de voorpagina"
        >
          <Wordmark priority />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {showRegistry ? (
            <Link
              href="/leden"
              aria-current={current === '/leden' ? 'page' : undefined}
              className={`tap-target hidden items-center rounded-lg px-3 text-[13px] font-medium uppercase tracking-[0.16em] transition-all duration-150 sm:inline-flex ${
                current === '/leden'
                  ? 'bg-creme/10 text-creme'
                  : 'text-muted hover:bg-panel-high hover:text-ink'
              }`}
            >
              Ledenlijst
            </Link>
          ) : null}
          <AuthControls viewer={viewer} next={current} />
        </div>
      </nav>
    </div>
  );
}
