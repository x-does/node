import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';
import { Section } from '@/components/ui/section';
import { Card, CardTitle, CardBody } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your authenticated dashboard.',
};

export default async function DashboardPage() {
  const { user } = await requireAuth();

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return (
    <Section heading="Dashboard" subheading="You are signed in.">
      <Card>
        <CardTitle>Account</CardTitle>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex gap-3">
            {user.profilePictureUrl && (
              <img
                src={user.profilePictureUrl}
                alt=""
                className="size-12 rounded-full border border-border"
              />
            )}
            <div>
              <div className="font-semibold text-foreground">{displayName}</div>
              <div className="text-muted">{user.email}</div>
              <div className="mt-1 text-xs text-subtle">ID: {user.id}</div>
            </div>
          </div>
        </div>
      </Card>

      <form action="/api/auth/logout" method="POST" className="mt-6">
        <button
          type="submit"
          className="rounded-xl border border-border-bright bg-surface px-5 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-surface-raised"
        >
          Sign out
        </button>
      </form>
    </Section>
  );
}
