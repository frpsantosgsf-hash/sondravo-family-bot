import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sondravo Family • Management',
  description: 'Sondravo Family finance and management dashboard'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
