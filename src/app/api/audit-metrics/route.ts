import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isInternalAuditSource } from '@/lib/audit-source';
import { AUDIT_EVENT_KEY } from '@/lib/audit-config';

export const dynamic = 'force-dynamic';

interface ScopedMetrics {
  total: number;
  unique: number;
  automatedTotal: number;
  nonAutomatedTotal: number;
  lastEventAt: string | null;
  windowStartUtc: string | null;
  bySource: { source: string; total: number; automatedTotal: number }[];
  external: {
    total: number;
    unique: number;
    automatedTotal: number;
    nonAutomatedTotal: number;
    lastEventAt: string | null;
    bySource: { source: string; total: number; automatedTotal: number }[];
  };
  internal: {
    total: number;
    automatedTotal: number;
    nonAutomatedTotal: number;
    lastEventAt: string | null;
    bySource: { source: string; total: number; automatedTotal: number }[];
  };
}

async function loadScopedMetrics(
  eventKey: string,
  afterDate?: Date,
  windowStartUtc: string | null = null,
): Promise<ScopedMetrics> {
  const where = {
    eventKey,
    ...(afterDate ? { createdAt: { gte: afterDate } } : {}),
  };

  const events = await prisma.leadEvent.findMany({ where });

  const total = events.length;
  const identitySet = new Set<string>();
  const sourceMap = new Map<string, { total: number; automatedTotal: number }>();
  let automatedTotal = 0;
  let lastEventAt: Date | null = null;

  const externalIdentitySet = new Set<string>();
  let externalLastEventAt: Date | null = null;
  let internalLastEventAt: Date | null = null;

  for (const e of events) {
    const identity = e.ipHash || e.userAgent || `event-${e.id}`;
    identitySet.add(identity);

    if (e.automatedUa) automatedTotal++;
    if (!lastEventAt || e.createdAt > lastEventAt) lastEventAt = e.createdAt;

    const existing = sourceMap.get(e.source) || { total: 0, automatedTotal: 0 };
    existing.total++;
    if (e.automatedUa) existing.automatedTotal++;
    sourceMap.set(e.source, existing);

    if (isInternalAuditSource(e.source)) {
      if (!internalLastEventAt || e.createdAt > internalLastEventAt) internalLastEventAt = e.createdAt;
    } else {
      externalIdentitySet.add(identity);
      if (!externalLastEventAt || e.createdAt > externalLastEventAt) externalLastEventAt = e.createdAt;
    }
  }

  const bySource = Array.from(sourceMap.entries())
    .map(([source, data]) => ({ source, ...data }))
    .sort((a, b) => b.total - a.total || a.source.localeCompare(b.source));

  const internalSources = bySource.filter((s) => isInternalAuditSource(s.source));
  const externalSources = bySource.filter((s) => !isInternalAuditSource(s.source));

  const internalTotal = internalSources.reduce((sum, s) => sum + s.total, 0);
  const externalTotal = externalSources.reduce((sum, s) => sum + s.total, 0);
  const internalAutomated = internalSources.reduce((sum, s) => sum + s.automatedTotal, 0);
  const externalAutomated = externalSources.reduce((sum, s) => sum + s.automatedTotal, 0);

  return {
    total,
    unique: identitySet.size,
    automatedTotal,
    nonAutomatedTotal: total - automatedTotal,
    lastEventAt: lastEventAt?.toISOString() ?? null,
    windowStartUtc,
    bySource,
    external: {
      total: externalTotal,
      unique: externalIdentitySet.size,
      automatedTotal: externalAutomated,
      nonAutomatedTotal: externalTotal - externalAutomated,
      lastEventAt: externalLastEventAt?.toISOString() ?? null,
      bySource: externalSources,
    },
    internal: {
      total: internalTotal,
      automatedTotal: internalAutomated,
      nonAutomatedTotal: internalTotal - internalAutomated,
      lastEventAt: internalLastEventAt?.toISOString() ?? null,
      bySource: internalSources,
    },
  };
}

export async function GET() {
  try {
    const eventKey = AUDIT_EVENT_KEY;
    const now = new Date();
    const last24hStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last60mStart = new Date(now.getTime() - 60 * 60 * 1000);

    const overall = await loadScopedMetrics(eventKey);
    const last24h = await loadScopedMetrics(eventKey, last24hStart, last24hStart.toISOString());
    const last60m = await loadScopedMetrics(eventKey, last60mStart, last60mStart.toISOString());

    const hasRecentExternal = overall.external.lastEventAt !== null;
    const minutesSinceLastExternal = hasRecentExternal
      ? Math.round((now.getTime() - new Date(overall.external.lastEventAt!).getTime()) / 60000)
      : null;

    return NextResponse.json({
      ...overall,
      windows: { last24h, last60m },
      signal: {
        freshExternalIntent: last60m.external.nonAutomatedTotal > 0,
        hasExternalInLast24h: last24h.external.total > 0,
        minutesSinceLastExternalEvent: minutesSinceLastExternal,
      },
      trackingRule: `All events tracked under key "${eventKey}".`,
    });
  } catch (err) {
    console.error('[audit-metrics]', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load metrics' },
      { status: 500 },
    );
  }
}
