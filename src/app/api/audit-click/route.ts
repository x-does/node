import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { normalizeAuditSource, isLikelyAutomatedUserAgent } from '@/lib/audit-source';
import { buildAuditTelegramStartUrl, AUDIT_EVENT_KEY } from '@/lib/audit-config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rawSource = searchParams.get('src') || 'unknown';
  const eventKey = searchParams.get('event') || AUDIT_EVENT_KEY;

  const source = normalizeAuditSource(rawSource);

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || null;
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
  const automatedUa = isLikelyAutomatedUserAgent(userAgent);

  try {
    await prisma.leadEvent.create({
      data: {
        eventKey,
        source,
        userAgent,
        ipHash,
        automatedUa,
      },
    });
  } catch (err) {
    console.error('[audit-click] insert failed:', err);
  }

  const redirectUrl = buildAuditTelegramStartUrl(eventKey);

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: redirectUrl,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
