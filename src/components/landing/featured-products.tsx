import Link from 'next/link';
import { Card, CardTitle, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Section } from '@/components/ui/section';
import { prisma } from '@/lib/prisma';

export async function FeaturedProducts() {
  let products: {
    slug: string;
    title: string;
    description: string;
    type: string;
    price: unknown;
    currency: string;
  }[] = [];

  try {
    products = await prisma.product.findMany({
      where: { featured: true, status: 'active' },
      orderBy: { sortOrder: 'asc' },
      take: 6,
    });
  } catch {
    return null;
  }

  if (products.length === 0) return null;

  return (
    <Section heading="Featured" subheading="Highlights from the store.">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <Link key={p.slug} href={`/store/${p.slug}`}>
            <Card hover className="h-full">
              <div className="flex items-start justify-between gap-2">
                <CardTitle>{p.title}</CardTitle>
                <Badge variant={p.type === 'free' ? 'success' : 'accent'}>
                  {p.type === 'free' ? 'Free' : p.price != null ? `${p.currency} ${p.price}` : p.type}
                </Badge>
              </div>
              <CardBody>{p.description}</CardBody>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-6 text-center">
        <Link
          href="/store"
          className="text-sm font-semibold text-accent transition-colors hover:text-accent-bright"
        >
          View all in store &rarr;
        </Link>
      </div>
    </Section>
  );
}
