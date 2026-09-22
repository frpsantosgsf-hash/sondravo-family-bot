import type { Metadata, Viewport } from 'next';
import { Inter, Oswald } from 'next/font/google';
import { ToastProvider } from '@/components/ui/Toast';
import { getSiteUrl } from '@/lib/env';
import './globals.css';

const display = Oswald({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: 'The Sondravo Family | Member Registry',
    template: '%s | The Sondravo Family',
  },
  description: 'Official member registry of The Sondravo Family.',
  applicationName: 'The Sondravo Family',
  openGraph: {
    title: 'The Sondravo Family | Member Registry',
    description: 'Official member registry of The Sondravo Family.',
    siteName: 'The Sondravo Family',
    type: 'website',
    locale: 'nl_NL',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Sondravo Family | Member Registry',
    description: 'Official member registry of The Sondravo Family.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0c0b',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${display.variable} ${sans.variable}`}>
      <body className="antialiased">
        <a
          href="#hoofdinhoud"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-creme focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-void"
        >
          Naar hoofdinhoud
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
