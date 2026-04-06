import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { normalizeAuditSource, isLikelyAutomatedUserAgent } from '@/lib/audit-source';
import { buildAuditTelegramStartUrl, AUDIT_EVENT_KEY } from '@/lib/audit-config';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // max 10 audit-click events per minute per IP

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ipHash: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ipHash);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ipHash, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

// Periodically clean up expired entries to prevent memory leak (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60_000);

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

  if (isRateLimited(ipHash)) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'Cache-Control': 'no-store',
        },
      },
    );
  }

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
