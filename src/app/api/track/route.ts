import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getClientInfo } from '@/lib/tracking';
import type { TrackingPayload } from '@/types';

/**
 * Simple in-memory rate limiter.
 * Tracks request counts per IP hash within a sliding window.
 * Resets automatically when the window expires.
 */
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // max 30 tracking events per minute per IP

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ipHash: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ipHash);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ipHash, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  return false;
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

export async function POST(request: NextRequest) {
  try {
    const { userAgent, ipHash } = await getClientInfo();

    // Rate limiting check
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

    const body = (await request.json()) as TrackingPayload;

    if (body.type === 'pageview' && body.path) {
      await prisma.pageView.create({
        data: {
          path: body.path,
          referrer: body.referrer || null,
          userAgent: userAgent || null,
          ipHash,
        },
      });
    } else if (body.type === 'event' && body.name) {
      await prisma.trackingEvent.create({
        data: {
          name: body.name,
          category: body.category || null,
          payload: (body.payload as Prisma.InputJsonValue) ?? undefined,
          path: body.path || null,
          userAgent: userAgent || null,
          ipHash,
        },
      });
    } else {
      return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
