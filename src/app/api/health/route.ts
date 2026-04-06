import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ROOT_PARITY_MARKER, AUDIT_EVENT_KEY } from '@/lib/audit-config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requireDb = request.nextUrl.searchParams.get('requireDb') === '1';
  const timestamp = new Date().toISOString();

  if (!requireDb) {
    return NextResponse.json(
      {
        ok: true,
        service: 'x-does-node-next',
        framework: 'next-app-router',
        database: {
          checked: false,
          connected: null,
          mode: 'non-blocking',
        },
        timestamp,
        parityMarker: ROOT_PARITY_MARKER,
        auditEventKey: AUDIT_EVENT_KEY,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  try {
    // Re-deploy nudge 1774812000
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        ok: true,
        service: 'x-does-node-next',
        framework: 'next-app-router',
        database: {
          checked: true,
          connected: true,
          serverTime: new Date().toISOString(),
        },
        timestamp,
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
        database: { checked: true, connected: false, error: 'connection_failed' },
        timestamp,
        parityMarker: ROOT_PARITY_MARKER,
        auditEventKey: AUDIT_EVENT_KEY,
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
