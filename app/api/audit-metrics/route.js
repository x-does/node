import { getLeadCounts } from '../../../lib/db.js';

const EVENT_KEY = 'node_audit_20260328';

export async function GET() {
  try {
    const counts = await getLeadCounts(EVENT_KEY);
    return Response.json({
      ok: true,
      eventKey: EVENT_KEY,
      counts,
      trackingRule:
        'Use unique lead clicks from openclaw_lead_events and compare against unique Telegram /start payloads.',
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
