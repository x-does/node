import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { PrismaDnpAdapter } from '@/lib/dnp/prisma-adapter';
import { DnpRoomService, DnpServiceError } from '@/lib/dnp/service';

// Best-effort only: this in-process limiter is reset on deploy/restart and is not
// shared across serverless instances. It is intended to blunt accidental floods;
// durable production limits should live at the edge/proxy or in a shared store.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 80;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function dnpService() {
  return new DnpRoomService(new PrismaDnpAdapter(prisma));
}

export async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function bearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

function ipKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

export function checkDnpRateLimit(request: Request, token?: unknown) {
  const tokenPart = typeof token === 'string' && token.length > 0 ? token : 'anon';
  const key = `${ipKey(request)}:${tokenPart}`;
  const at = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= at) {
    rateBuckets.set(key, { count: 1, resetAt: at + RATE_WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX) throw new DnpServiceError(429, 'Too many DNP requests.');
  if (rateBuckets.size > 5_000) {
    for (const [entryKey, entry] of rateBuckets) if (entry.resetAt <= at) rateBuckets.delete(entryKey);
  }
}

export function handleDnpError(error: unknown) {
  if (error instanceof DnpServiceError) return jsonNoStore({ error: error.message }, error.status);
  console.error(error);
  return jsonNoStore({ error: 'DNP request failed.' }, 500);
}
