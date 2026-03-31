import Link from 'next/link';
import { buildAuditClickHref, AUDIT_EVENT_KEY } from '@/lib/audit-config';

export function CtaBanner() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="rounded-3xl border border-border-bright bg-gradient-to-br from-surface to-surface-raised p-8 text-center shadow-xl shadow-accent/5 md:p-12">
        <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">
          Ready to find the leaks in your revenue loop?
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-muted">
          The Node Revenue Audit gives you a concrete, tracked action plan. Intake starts on Telegram.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href={buildAuditClickHref('cta_bottom', AUDIT_EVENT_KEY)}
            className="inline-flex items-center rounded-xl bg-gradient-to-br from-accent to-purple px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-all hover:brightness-110"
          >
            Start the paid audit
          </Link>
          <Link
            href="/store"
            className="inline-flex items-center rounded-xl border border-border-bright bg-surface px-6 py-3 text-sm font-semibold text-foreground transition-all hover:bg-surface-raised"
          >
            Browse the store
          </Link>
        </div>
      </div>
    </section>
  );
}
