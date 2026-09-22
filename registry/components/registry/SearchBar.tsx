'use client';

import { useId } from 'react';
import type { Rank } from '@/types';

interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  rankFilter: string;
  onRankFilterChange: (value: string) => void;
  ranks: Rank[];
  /** Aantal leden dat nu zichtbaar is, voor de schermlezer. */
  resultCount: number;
}

export function SearchBar({
  query,
  onQueryChange,
  rankFilter,
  onRankFilterChange,
  ranks,
  resultCount,
}: SearchBarProps) {
  const searchId = useId();
  const filterId = useId();

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row">
      <div className="relative flex-1">
        <label htmlFor={searchId} className="sr-only">
          Zoek een lid
        </label>
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <circle cx="9" cy="9" r="5.5" />
          <path d="M13.5 13.5L17 17" strokeLinecap="round" />
        </svg>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Zoek op naam, Discord of rang..."
          autoComplete="off"
          className="h-12 w-full rounded-lg border border-line bg-panel/80 pl-10 pr-10 text-sm text-ink transition-colors placeholder:text-muted-soft focus:border-creme/35 focus:bg-panel-high focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Zoekopdracht wissen"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-hover hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="relative sm:w-56">
        <label htmlFor={filterId} className="sr-only">
          Filter op rang
        </label>
        <select
          id={filterId}
          value={rankFilter}
          onChange={(event) => onRankFilterChange(event.target.value)}
          className="h-12 w-full appearance-none rounded-lg border border-line bg-panel/80 pl-3.5 pr-9 text-sm text-ink transition-colors focus:border-creme/35 focus:bg-panel-high focus:outline-none"
        >
          <option value="all">Alle rangen</option>
          {ranks.map((rank) => (
            <option key={rank.key} value={rank.key}>
              {rank.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <p aria-live="polite" className="sr-only">
        {resultCount} {resultCount === 1 ? 'lid' : 'leden'} gevonden
      </p>
    </div>
  );
}
