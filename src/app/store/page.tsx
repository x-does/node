import type { Metadata } from 'next';
import Link from 'next/link';
import { Section } from '@/components/ui/section';
import { ProductCard } from '@/components/store/product-card';
import { prisma } from '@/lib/prisma';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Store',
  description: 'Services, products, and free releases available from xdoes.',
};

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Services', value: 'service' },
  { label: 'Products', value: 'product' },
  { label: 'Free', value: 'free' },
];

interface Props {
  searchParams: Promise<{ type?: string }>;
}

export default async function StorePage({ searchParams }: Props) {
  const { type } = await searchParams;
  const activeFilter = type || '';

  let products: {
    slug: string;
    title: string;
    description: string;
    type: string;
    price: { toString(): string } | null;
    currency: string;
  }[] = [];

  try {
    products = await prisma.product.findMany({
      where: {
        status: 'active',
        ...(activeFilter ? { type: activeFilter } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  } catch {
    // DB unavailable
  }

  return (
    <Section heading="Store" subheading="Services, products, and free releases.">
      <div className="mb-8 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/store?type=${f.value}` : '/store'}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              activeFilter === f.value
                ? 'border-accent bg-accent-glow text-accent-bright'
                : 'border-border text-muted hover:text-foreground',
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {products.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard
              key={p.slug}
              slug={p.slug}
              title={p.title}
              description={p.description}
              type={p.type}
              price={p.price?.toString() ?? null}
              currency={p.currency}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface-overlay p-8 text-center">
          <p className="text-muted">No products available yet. Check back soon.</p>
        </div>
      )}
    </Section>
  );
}
