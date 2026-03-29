import { AUDIT_EVENT_KEY } from '../../../lib/audit-config.js';
import { getLeadMetrics } from '../../../lib/db.js';
import { withNoStoreHeaders } from '../../../lib/http-cache.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EVENT_KEY = AUDIT_EVENT_KEY;

function minutesSince(isoTimestamp, nowMs) {
  if (!isoTimestamp) {
    return null;
  }

  const ts = Date.parse(isoTimestamp);
  if (Number.isNaN(ts)) {
    return null;
  }

  return Math.max(0, Math.floor((nowMs - ts) / 60000));
}

export async function GET() {
  try {
    const metrics = await getLeadMetrics(EVENT_KEY);
    const generatedAt = new Date();
    const generatedAtUtc = generatedAt.toISOString();
    const nowMs = generatedAt.getTime();

    const signal = {
      hasExternalIntentLast60m: metrics.windows?.last60m?.external?.unique > 0,
      hasExternalIntentLast24h: metrics.windows?.last24h?.external?.unique > 0,
      hasNonAutomatedExternalIntentLast60m: (metrics.windows?.last60m?.external?.nonAutomatedTotal || 0) > 0,
      hasNonAutomatedExternalIntentLast24h: (metrics.windows?.last24h?.external?.nonAutomatedTotal || 0) > 0,
      externalMinutesSinceLastEvent: minutesSince(metrics.external?.lastEventAt, nowMs),
      internalMinutesSinceLastEvent: minutesSince(metrics.internal?.lastEventAt, nowMs),
      windows: {
        last60m: {
          externalMinutesSinceLastEvent: minutesSince(metrics.windows?.last60m?.external?.lastEventAt, nowMs),
          internalMinutesSinceLastEvent: minutesSince(metrics.windows?.last60m?.internal?.lastEventAt, nowMs),
          externalNonAutomatedTotal: metrics.windows?.last60m?.external?.nonAutomatedTotal || 0,
        },
        last24h: {
          externalMinutesSinceLastEvent: minutesSince(metrics.windows?.last24h?.external?.lastEventAt, nowMs),
          internalMinutesSinceLastEvent: minutesSince(metrics.windows?.last24h?.internal?.lastEventAt, nowMs),
          externalNonAutomatedTotal: metrics.windows?.last24h?.external?.nonAutomatedTotal || 0,
        },
      },
    };

    return withNoStoreHeaders(
      Response.json({
        ok: true,
        eventKey: EVENT_KEY,
        generatedAtUtc,
        metrics,
        signal,
        trackingRule:
          'Use unique lead clicks from openclaw_lead_events and compare against unique Telegram /start payloads.',
        qualificationRule:
          'Treat only unique Telegram /start payload conversations with a concrete revenue/automation problem as qualified leads.',
        sourceClassification:
          'Sources with prefixes deploy_probe*, probe_*, verify_*, internal_*, monitor_* are treated as internal verification traffic and excluded from external.unique.',
        automationRule:
          'Events with likely automated user-agents (bot/crawler/link-preview/monitor signatures) are flagged in metrics.*.automatedTotal; metrics.*.nonAutomatedTotal exposes likely human traffic. Automated events remain counted in totals for transparency.',
        windowsRule:
          'metrics.windows.last60m and metrics.windows.last24h use UTC rolling windows; each window includes windowStartUtc for deterministic interpretation.',
        freshnessRule:
          'Use metrics.external.lastEventAt and metrics.windows.{last60m,last24h}.external.lastEventAt to see if fresh external intent exists, independent of internal probes.',
        signalRule:
          'signal.* gives decision-ready booleans and minute deltas from generatedAtUtc; treat hasExternalIntentLast60m=false as no fresh external click intent in the last hour, and prioritize hasNonAutomatedExternalIntentLast60m for likely-human intent.',
      })
    );
  } catch (error) {
    return withNoStoreHeaders(
      Response.json(
        {
          ok: false,
          eventKey: EVENT_KEY,
          error: error instanceof Error ? error.message : 'Failed to load audit metrics',
        },
        { status: 500 }
      )
    );
  }
}
