import Link from 'next/link';
import { Card, CardTitle, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AppInfo } from '@/lib/apps-data';

const statusConfig = {
  live: { label: 'Live', variant: 'success' as const },
  beta: { label: 'Beta', variant: 'warning' as const },
  'coming-soon': { label: 'Coming Soon', variant: 'default' as const },
};

export function AppCard({ app }: { app: AppInfo }) {
  const status = statusConfig[app.status];

  return (
    <Link href={`/apps/${app.slug}`}>
      <Card hover className="h-full">
        <div className="flex items-start justify-between gap-2">
          <CardTitle>{app.title}</CardTitle>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <CardBody>{app.description}</CardBody>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {app.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      </Card>
    </Link>
  );
}
