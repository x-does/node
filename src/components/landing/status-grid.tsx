import { Section } from '@/components/ui/section';
import { prisma } from '@/lib/prisma';

interface StatusCard {
  slug: string;
  title: string;
  valueText: string;
  publicNote: string | null;
}

async function loadStatus(): Promise<{ ok: boolean; cards: StatusCard[]; error?: string }> {
  try {
    const cards = await prisma.appStatus.findMany({ orderBy: { id: 'asc' } });
    return {
      ok: true,
      cards: cards.map((c) => ({
        slug: c.slug,
        title: c.title,
        valueText: c.valueText,
        publicNote: c.publicNote,
      })),
    };
  } catch (err) {
    return {
      ok: false,
      cards: [],
      error: err instanceof Error ? err.message : 'Failed to load DB status',
    };
  }
}

export async function StatusGrid() {
  const status = await loadStatus();

  return (
    <Section id="status" heading="Live status" subheading="Rendered server-side from Hostinger MySQL when available.">
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {[
          { label: 'Site', value: 'node.xdoes.space' },
          { label: 'Goal', value: 'Public conversion' },
          { label: 'Format', value: 'Launch page' },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl border border-border bg-surface-overlay p-4">
            <div className="text-xs text-accent-bright">{m.label}</div>
            <div className="mt-1 text-xl font-bold text-foreground">{m.value}</div>
          </div>
        ))}
      </div>

      {status.ok ? (
        <div className="grid gap-3 md:grid-cols-2">
          {status.cards.map((card) => (
            <div key={card.slug} className="rounded-2xl border border-border bg-surface-overlay p-5">
              <div className="text-xs text-accent-bright">{card.title}</div>
              <div className="mt-1 text-xl font-bold text-foreground">{card.valueText}</div>
              {card.publicNote && <p className="mt-2 text-sm leading-relaxed text-muted">{card.publicNote}</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-error/30 bg-error-bg p-5 text-sm text-red-200">
          DB connection failed: {status.error}
        </div>
      )}
    </Section>
  );
}
