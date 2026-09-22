'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Spinner } from '@/components/ui/Button';
import type { Viewer } from '@/types';

interface AuthControlsProps {
  viewer: Viewer | null;
  /** Pad waar de bezoeker na in- of uitloggen terechtkomt. */
  next: string;
  disabled?: boolean;
  /**
   * Tekst op de inlogknop. Standaard gewoon "Inloggen": leden loggen in om de
   * ledenlijst te zien en te stemmen, sollicitanten om het formulier te
   * openen. "Lead login" gaf de indruk dat het alleen voor de leiding was.
   */
  label?: string;
}

/**
 * Rechtsboven: de subtiele inlogknop, of de status van de ingelogde
 * bezoeker met een uitlogknop.
 */
export function AuthControls({
  viewer,
  next,
  disabled = false,
  label = 'Inloggen',
}: AuthControlsProps) {
  const [pending, setPending] = useState(false);

  if (!viewer) {
    return (
      <form action="/auth/login" method="post" onSubmit={() => setPending(true)}>
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          disabled={pending || disabled}
          className="tap-target group inline-flex items-center gap-2 rounded-lg border border-line bg-panel-high/80 px-3 text-[13px] text-muted transition-all duration-150 hover:border-creme/25 hover:bg-panel-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-55"
        >
          {pending ? <Spinner /> : <DiscordGlyph />}
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">Login</span>
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel-high/80 py-1.5 pl-1.5 pr-3">
        {viewer.avatarUrl ? (
          <Image
            src={viewer.avatarUrl}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-line"
            unoptimized
          />
        ) : (
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-creme/10 text-[11px] font-semibold text-creme"
          >
            {viewer.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="flex min-w-0 max-w-[9rem] flex-col leading-tight sm:max-w-none">
          <span className="truncate text-[13px] text-ink">
            <span className="hidden sm:inline">Ingelogd als </span>
            {viewer.name}
          </span>
          <span
            className={`truncate whitespace-nowrap text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.18em] ${
              viewer.isAdmin ? 'text-creme/80' : 'text-muted-soft'
            }`}
          >
            {viewer.isAdmin ? 'Lead · Admin' : 'Geen rechten'}
          </span>
        </span>
      </div>

      <form action="/auth/signout" method="post" onSubmit={() => setPending(true)}>
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          disabled={pending}
          className="tap-target inline-flex items-center justify-center rounded-lg border border-line bg-panel-high/80 px-3 text-[13px] text-muted transition-all duration-150 hover:border-sondravo-red/40 hover:text-[#f2a9ac] disabled:opacity-55"
        >
          {pending ? <Spinner /> : <span className="hidden sm:inline">Uitloggen</span>}
          <span className="sm:hidden" aria-hidden>
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 14l3-4-3-4M15 10H7M9 4H5v12h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="sr-only sm:hidden">Uitloggen</span>
        </button>
      </form>
    </div>
  );
}

function DiscordGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0" fill="currentColor">
      <path d="M20.3 4.6A19 19 0 0 0 15.6 3l-.3.5a14 14 0 0 1 4 2 13.6 13.6 0 0 0-11.7 0 14 14 0 0 1 4-2L11.4 3A19 19 0 0 0 6.7 4.6C3.7 9 2.9 13.3 3.3 17.5a19 19 0 0 0 5.7 2.9l1.2-1.7a12.3 12.3 0 0 1-1.9-.9l.5-.4a13.6 13.6 0 0 0 11.6 0l.5.4c-.6.4-1.3.7-2 .9l1.2 1.7a19 19 0 0 0 5.8-2.9c.5-4.9-.8-9.1-3.6-12.9ZM9.7 15c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3Zm4.6 0c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3Z" />
    </svg>
  );
}
