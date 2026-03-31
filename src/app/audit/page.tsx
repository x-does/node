import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { buildAuditClickHref, AUDIT_EVENT_KEY, ROOT_PARITY_MARKER } from '@/lib/audit-config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Node Revenue Audit',
  description: 'Tracked audit intake for revenue loops, automation leaks, and growth blockers.',
};

export default function AuditPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl rounded-2xl border border-border-bright bg-surface-overlay p-7 shadow-2xl shadow-black/30">
        <Badge variant="accent">node.xdoes.space &middot; audit intake</Badge>

        <h1 className="mt-4 font-display text-2xl font-bold text-foreground md:text-3xl">
          Node Revenue / Automation Audit
        </h1>

        <p className="mt-3 leading-relaxed text-muted">
          If your automations, agents, or revenue loop are leaking, this path goes straight to the
          tracked audit intake.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={buildAuditClickHref('audit_page_primary', AUDIT_EVENT_KEY)}
            className="inline-flex items-center rounded-xl bg-gradient-to-br from-accent-bright to-accent px-5 py-3 text-sm font-bold text-[#081122] shadow-lg shadow-accent/20 transition-all hover:brightness-110"
          >
            Start the paid audit
          </a>
          <a
            href={buildAuditClickHref('audit_page_secondary', AUDIT_EVENT_KEY)}
            className="inline-flex items-center rounded-xl border border-border-bright bg-surface px-5 py-3 text-sm font-semibold text-foreground transition-all hover:bg-surface-raised"
          >
            Prefer the fallback audit link
          </a>
        </div>

        <ul className="mt-5 space-y-1 text-sm text-muted">
          <li>Tracking key: <code className="text-accent-bright">{AUDIT_EVENT_KEY}</code></li>
          <li>Parity marker: <code className="text-accent-bright">{ROOT_PARITY_MARKER}</code></li>
          <li>This page is kept dynamic/no-store for verification stability.</li>
        </ul>
      </div>
    </div>
  );
}
