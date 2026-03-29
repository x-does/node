import { AUDIT_EVENT_KEY, ROOT_PARITY_MARKER } from '../../../lib/audit-config.js';
import { getPool } from '../../../lib/db.js';
import { withNoStoreHeaders } from '../../../lib/http-cache.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EVENT_KEY = AUDIT_EVENT_KEY;
const PARITY_MARKER = ROOT_PARITY_MARKER;

export async function GET() {
  try {
    const [rows] = await getPool().query('SELECT DATABASE() AS db_name, NOW() AS now_ts');
    return withNoStoreHeaders(
      Response.json({
        ok: true,
        service: 'node.xdoes.space',
        framework: 'nextjs',
        database: rows?.[0]?.db_name || null,
        timestamp: rows?.[0]?.now_ts || new Date().toISOString(),
        parityMarker: PARITY_MARKER,
        auditEventKey: EVENT_KEY,
      })
    );
  } catch (error) {
    return withNoStoreHeaders(
      Response.json(
        {
          ok: false,
          service: 'node.xdoes.space',
          framework: 'nextjs',
          parityMarker: PARITY_MARKER,
          auditEventKey: EVENT_KEY,
          error: error instanceof Error ? error.message : 'DB health check failed',
        },
        { status: 500 }
      )
    );
  }
}
