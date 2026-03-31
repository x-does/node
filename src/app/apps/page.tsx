import type { Metadata } from 'next';
import { Section } from '@/components/ui/section';
import { AppCard } from '@/components/apps/app-card';
import { apps } from '@/lib/apps-data';

export const metadata: Metadata = {
  title: 'Apps',
  description: 'Tools and products built by the xdoes team.',
};

export default function AppsPage() {
  return (
    <Section heading="Apps" subheading="Tools and products built by the team.">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <AppCard key={app.slug} app={app} />
        ))}
      </div>
    </Section>
  );
}
