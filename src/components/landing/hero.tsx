import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buildAuditClickHref, AUDIT_EVENT_KEY, ROOT_PARITY_MARKER } from '@/lib/audit-config';

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-8 pt-12 md:pt-20">
      <Badge variant="accent">node.xdoes.space</Badge>

      <div className="mt-4" aria-label="root-parity-marker">
        <span className="text-sm font-bold tracking-wide text-accent-bright">
          {ROOT_PARITY_MARKER}
        </span>
      </div>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <h1 className="font-display text-4xl font-bold leading-[0.95] tracking-tight text-foreground md:text-6xl lg:text-7xl">
            Services, products,
            <br />
            and free releases.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            node.xdoes.space is the public face of the build team: a place to show what we sell,
            what we are making next, and what we release for free to earn attention, trust, and
            revenue.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="#offerings"
              className="inline-flex items-center rounded-xl bg-gradient-to-br from-accent to-purple px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-all hover:brightness-110"
            >
              See offerings
            </Link>
            <Link
              href={buildAuditClickHref('hero_primary', AUDIT_EVENT_KEY)}
              className="inline-flex items-center rounded-xl border border-border-bright bg-surface px-5 py-3 text-sm font-semibold text-foreground transition-all hover:bg-surface-raised"
            >
              Request a paid Node Revenue Audit
            </Link>
          </div>
        </div>

        <aside className="rounded-2xl border border-border bg-surface-overlay p-5 shadow-xl shadow-black/20">
          <div className="text-xs font-semibold uppercase tracking-widest text-accent-bright">
            What this page should do
          </div>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted">
            <li>Make the site public-first and easy to understand in a few seconds.</li>
            <li>Show live proof when available, but never expose secrets or internal-only links.</li>
            <li>Turn the page into a launchpad for services, products, and free releases.</li>
            <li>Keep the messaging focused on what users can get now and what is coming next.</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
