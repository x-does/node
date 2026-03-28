import { getLeadMetrics } from '../../../lib/db.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EVENT_KEY = 'node_audit_20260328';
const NO_STORE = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0';

function withNoStoreHeaders(response) {
  response.headers.set('Cache-Control', NO_STORE);
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

export async function GET() {
  try {
    const metrics = await getLeadMetrics(EVENT_KEY);
    return withNoStoreHeaders(
      Response.json({
        ok: true,
        eventKey: EVENT_KEY,
        metrics,
        trackingRule:
          'Use unique lead clicks from openclaw_lead_events and compare against unique Telegram /start payloads.',
        qualificationRule:
          'Treat only unique Telegram /start payload conversations with a concrete revenue/automation problem as qualified leads.',
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
