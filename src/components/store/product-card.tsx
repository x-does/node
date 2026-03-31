import Link from 'next/link';
import { Card, CardTitle, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ProductCardProps {
  slug: string;
  title: string;
  description: string;
  type: string;
  price: string | null;
  currency: string;
}

export function ProductCard({ slug, title, description, type, price, currency }: ProductCardProps) {
  const typeVariant = type === 'free' ? 'success' : type === 'service' ? 'purple' : 'accent';
  const priceLabel = type === 'free' ? 'Free' : price ? `${currency} ${price}` : type;

  return (
    <Link href={`/store/${slug}`}>
      <Card hover className="h-full">
        <div className="flex items-start justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant={typeVariant}>{priceLabel}</Badge>
        </div>
        <CardBody>{description}</CardBody>
        <div className="mt-3">
          <Badge variant="default">{type}</Badge>
        </div>
      </Card>
    </Link>
  );
}
