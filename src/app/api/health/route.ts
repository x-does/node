import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ROOT_PARITY_MARKER, AUDIT_EVENT_KEY } from '@/lib/audit-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Test database connection without exposing database name
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        ok: true,
        service: 'x-does-node-next',
        framework: 'next-app-router',
        database: {
          connected: true,
          serverTime: new Date().toISOString(),
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
    // Log full error server-side for debugging
    console.error('[health] Database connection failed:', err);

    return NextResponse.json(
      {
        ok: false,
        service: 'x-does-node-next',
        framework: 'next-app-router',
        database: { connected: false, error: 'connection_failed' },
        timestamp: new Date().toISOString(),
        parityMarker: ROOT_PARITY_MARKER,
        auditEventKey: AUDIT_EVENT_KEY,
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
