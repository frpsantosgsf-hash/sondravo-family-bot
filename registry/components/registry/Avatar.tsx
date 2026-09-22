'use client';

import { useState } from 'react';
import Image from 'next/image';
import { avatarSeed, initials } from '@/lib/format';

interface AvatarProps {
  name: string;
  src: string | null;
  /** Ring-klasse die bij de rang hoort. */
  ring: string;
  size?: 'sm' | 'md';
}

/**
 * Ronde avatar met een nette terugval op initialen.
 * De tint van de terugval is stabiel per lid, zodat de lijst rustig oogt maar
 * niet eentonig wordt.
 */
export function Avatar({ name, src, ring, size = 'md' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const dimension = size === 'sm' ? 40 : 48;
  const boxClass = size === 'sm' ? 'h-10 w-10' : 'h-11 w-11 sm:h-12 sm:w-12';

  if (src && !failed) {
    return (
      <Image
        src={src}
        alt=""
        width={dimension}
        height={dimension}
        onError={() => setFailed(true)}
        className={`${boxClass} shrink-0 rounded-full object-cover ring-1 ${ring}`}
      />
    );
  }

  // Alleen de helderheid varieert per lid — de tint blijft antraciet, zodat
  // de lijst rustig blijft in plaats van een regenboog te worden.
  const depth = 12 + (avatarSeed(name) % 5);

  return (
    <span
      aria-hidden
      className={`${boxClass} flex shrink-0 items-center justify-center rounded-full font-display text-[13px] font-semibold tracking-wide ring-1 ${ring}`}
      style={{
        background: `linear-gradient(145deg, hsl(100 4% ${depth + 4}%), hsl(100 5% ${depth - 3}%))`,
        color: 'rgba(241, 232, 207, 0.82)',
      }}
    >
      {initials(name)}
    </span>
  );
}
