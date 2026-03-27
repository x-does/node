import { getPool } from '../../../lib/db.js';

export async function GET() {
  try {
    const [rows] = await getPool().query('SELECT DATABASE() AS db_name, NOW() AS now_ts');
    return Response.json({
      ok: true,
      service: 'node.xdoes.space',
      framework: 'nextjs',
      database: rows?.[0]?.db_name || null,
      timestamp: rows?.[0]?.now_ts || new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        service: 'node.xdoes.space',
        framework: 'nextjs',
        error: error instanceof Error ? error.message : 'DB health check failed',
      },
      { status: 500 }
    );
  }
}
