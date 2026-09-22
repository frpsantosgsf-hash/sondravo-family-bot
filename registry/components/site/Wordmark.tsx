import Image from 'next/image';

interface WordmarkProps {
  /** Compact = alleen het eiland-merkteken naast de naam. */
  variant?: 'compact' | 'stacked';
  className?: string;
  priority?: boolean;
}

/**
 * Het merk van de familie. `stacked` toont het volledige logo, `compact` het
 * eiland-merkteken met de naam ernaast (voor de navigatiebalk).
 */
export function Wordmark({ variant = 'compact', className = '', priority = false }: WordmarkProps) {
  if (variant === 'stacked') {
    return (
      <Image
        src="/logo.png"
        alt="The Sondravo Family"
        width={900}
        height={906}
        priority={priority}
        sizes="(max-width: 640px) 70vw, 420px"
        className={`h-auto w-full max-w-[420px] drop-shadow-[0_24px_60px_rgba(0,0,0,0.65)] ${className}`}
      />
    );
  }

  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src="/sondravo-mark.png"
        alt=""
        width={400}
        height={240}
        priority={priority}
        sizes="40px"
        className="h-9 w-auto shrink-0 sm:h-10"
      />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="font-display text-[15px] font-semibold uppercase tracking-[0.13em] text-creme sm:text-base">
          The Sondravo Family
        </span>
        <span className="mt-1 hidden text-[10px] uppercase tracking-[0.3em] text-muted sm:block">
          Official Family Registry
        </span>
      </span>
    </span>
  );
}
