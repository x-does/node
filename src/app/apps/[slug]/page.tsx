import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { apps, getAppBySlug } from '@/lib/apps-data';

interface Props {
  params: Promise<{ slug: string }>;
}

const statusConfig = {
  live: { label: 'Live', variant: 'success' as const },
  beta: { label: 'Beta', variant: 'warning' as const },
  'coming-soon': { label: 'Coming Soon', variant: 'default' as const },
};

export function generateStaticParams() {
  return apps.map((app) => ({ slug: app.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const app = getAppBySlug(slug);
  if (!app) return { title: 'App Not Found' };
  return {
    title: app.title,
    description: app.description,
  };
}

export default async function AppDetailPage({ params }: Props) {
  const { slug } = await params;
  const app = getAppBySlug(slug);
  if (!app) notFound();

  const status = statusConfig[app.status];

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/apps" className="text-sm text-accent transition-colors hover:text-accent-bright">
        &larr; Back to apps
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Badge variant={status.variant}>{status.label}</Badge>
        <div className="flex flex-wrap gap-1.5">
          {app.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      </div>

      <h1 className="mt-4 font-display text-3xl font-bold text-foreground md:text-4xl">
        {app.title}
      </h1>

      <p className="mt-6 text-base leading-relaxed text-muted">
        {app.longDescription || app.description}
      </p>

      {app.url && (
        <div className="mt-8">
          <Link
            href={app.url}
            className="inline-flex items-center rounded-xl bg-gradient-to-br from-accent to-purple px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-all hover:brightness-110"
          >
            Open app &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
