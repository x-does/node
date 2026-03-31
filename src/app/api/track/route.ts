import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getClientInfo } from '@/lib/tracking';
import type { TrackingPayload } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TrackingPayload;
    const { userAgent, ipHash } = await getClientInfo();

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
