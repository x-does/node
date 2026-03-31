import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { TrackPageView } from '@/components/tracking/track-page-view';
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
    default: 'node.xdoes.space',
    template: '%s | node.xdoes.space',
  },
  description: 'Services, products, and free releases from the build team.',
  metadataBase: new URL('https://node.xdoes.space'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-background font-sans text-foreground antialiased">
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
        <TrackPageView />
      </body>
    </html>
  );
}
