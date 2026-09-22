'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-creme text-void hover:bg-white disabled:hover:bg-creme font-semibold shadow-[0_10px_30px_-16px_rgba(241,232,207,0.6)]',
  secondary:
    'border border-line bg-panel-high text-ink hover:border-creme/25 hover:bg-panel-hover',
  ghost: 'text-muted hover:bg-panel-high hover:text-ink',
  danger:
    'border border-sondravo-red/40 bg-sondravo-red/10 text-[#f2a9ac] hover:border-sondravo-red/70 hover:bg-sondravo-red/20',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-lg tracking-wide transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
