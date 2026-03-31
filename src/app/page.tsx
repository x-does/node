import { Hero } from '@/components/landing/hero';
import { Offerings } from '@/components/landing/offerings';
import { Roadmap } from '@/components/landing/roadmap';
import { StatusGrid } from '@/components/landing/status-grid';
import { FeaturedProducts } from '@/components/landing/featured-products';
import { CtaBanner } from '@/components/landing/cta-banner';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <>
      <Hero />
      <Offerings />
      <Roadmap />
      <StatusGrid />
      <FeaturedProducts />
      <CtaBanner />
    </>
  );
}
