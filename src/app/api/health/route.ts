import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ROOT_PARITY_MARKER, AUDIT_EVENT_KEY } from '@/lib/audit-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result: Array<{ db_name: string; now_ts: Date }> = await prisma.$queryRaw`
      SELECT DATABASE() AS db_name, NOW() AS now_ts
    `;

    const row = result[0];

    return NextResponse.json(
      {
        ok: true,
        service: 'x-does-node-next',
        framework: 'next-app-router',
        database: {
          connected: true,
          name: row?.db_name ?? null,
          serverTime: row?.now_ts ?? null,
        },
        timestamp: new Date().toISOString(),
        parityMarker: ROOT_PARITY_MARKER,
        auditEventKey: AUDIT_EVENT_KEY,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        service: 'x-does-node-next',
        framework: 'next-app-router',
        database: { connected: false, error: err instanceof Error ? err.message : 'unknown' },
        timestamp: new Date().toISOString(),
        parityMarker: ROOT_PARITY_MARKER,
        auditEventKey: AUDIT_EVENT_KEY,
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
