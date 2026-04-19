import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { MainShell } from '@/components/main-shell';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'X Does',
    template: '%s | X Does',
  },
  description: 'Main portal for xdoes.',
  metadataBase: new URL('https://node.xdoes.space'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-background font-sans text-foreground antialiased">
        <MainShell>{children}</MainShell>
      </body>
    </html>
  );
}
