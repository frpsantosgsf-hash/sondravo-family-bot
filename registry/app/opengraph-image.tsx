import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'The Sondravo Family — Official Family Registry';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Deelkaart voor Discord, WhatsApp en socials. */
export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), 'public', 'logo.png'));
  const logoSrc = `data:image/png;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          background: '#0b0c0b',
          backgroundImage:
            'radial-gradient(900px 420px at 50% -80px, rgba(241,232,207,0.10), transparent), radial-gradient(600px 400px at 100% 100%, rgba(215,25,32,0.10), transparent), radial-gradient(600px 400px at 0% 100%, rgba(14,90,49,0.12), transparent)',
        }}
      >
        <img src={logoSrc} alt="" width={360} height={362} style={{ objectFit: 'contain' }} />
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            letterSpacing: 14,
            color: '#8b8f8a',
            textTransform: 'uppercase',
          }}
        >
          Official Family Registry
        </div>
      </div>
    ),
    size,
  );
}
