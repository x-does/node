import { getLeadMetrics } from '../../../lib/db.js';

const EVENT_KEY = 'node_audit_20260328';

export async function GET() {
  try {
    const metrics = await getLeadMetrics(EVENT_KEY);
    return Response.json({
      ok: true,
      eventKey: EVENT_KEY,
      metrics,
      trackingRule:
        'Use unique lead clicks from openclaw_lead_events and compare against unique Telegram /start payloads.',
      qualificationRule:
        'Treat only unique Telegram /start payload conversations with a concrete revenue/automation problem as qualified leads.',
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        eventKey: EVENT_KEY,
        error: error instanceof Error ? error.message : 'Failed to load audit metrics',
      },
      { status: 500 }
    );
  }
}
