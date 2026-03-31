import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { prisma } from '@/lib/prisma';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await prisma.product.findUnique({ where: { slug } }).catch(() => null);
  if (!product) return { title: 'Product Not Found' };
  return {
    title: product.title,
    description: product.description.slice(0, 160),
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({ where: { slug } }).catch(() => null);
  if (!product) notFound();

  const typeVariant = product.type === 'free' ? 'success' : product.type === 'service' ? 'purple' : 'accent';
  const priceDisplay = product.type === 'free'
    ? 'Free'
    : product.price
      ? `${product.currency} ${product.price}`
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/store" className="text-sm text-accent transition-colors hover:text-accent-bright">
        &larr; Back to store
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Badge variant={typeVariant}>{product.type}</Badge>
        {priceDisplay && (
          <span className="text-2xl font-bold text-foreground">{priceDisplay}</span>
        )}
      </div>

      <h1 className="mt-4 font-display text-3xl font-bold text-foreground md:text-4xl">
        {product.title}
      </h1>

      <div className="mt-6 whitespace-pre-wrap text-base leading-relaxed text-muted">
        {product.description}
      </div>

      {product.ctaUrl && (
        <div className="mt-8">
          <a
            href={product.ctaUrl}
            className="inline-flex items-center rounded-xl bg-gradient-to-br from-accent to-purple px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-all hover:brightness-110"
          >
            {product.ctaLabel || 'Get started'}
          </a>
        </div>
      )}
    </div>
  );
}
