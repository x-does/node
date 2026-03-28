import crypto from 'crypto';
import { insertLeadEvent } from '../../../lib/db.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EVENT_KEY = 'node_audit_20260328';
const DESTINATION = 'https://t.me/world_fuckery_bot?start=node_audit_20260328';
const NO_STORE = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0';

function normalizeSource(rawSource) {
  if (!rawSource) {
    return 'unknown';
  }

  const cleaned = rawSource
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

  return cleaned || 'unknown';
}

function parseSource(url) {
  return normalizeSource(url.searchParams.get('src'));
}

function parseEventKey(url) {
  return url.searchParams.get('event') || EVENT_KEY;
}

function getDestination(eventKey) {
  if (eventKey === EVENT_KEY) {
    return DESTINATION;
  }

  return `https://t.me/world_fuckery_bot?start=${encodeURIComponent(eventKey)}`;
}

function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || null;
  }

  return request.headers.get('x-real-ip') || null;
}

function hashIp(value) {
  if (!value) {
    return null;
  }

  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function GET(request) {
  const url = new URL(request.url);
  const eventKey = parseEventKey(url);
  const source = parseSource(url);
  const userAgent = request.headers.get('user-agent') || null;
  const ipHash = hashIp(getClientIp(request));
  const destination = getDestination(eventKey);

  try {
    await insertLeadEvent({
      eventKey,
      source,
      userAgent,
      ipHash,
    });
  } catch (error) {
    console.error('audit click insert failed', error);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      'Cache-Control': NO_STORE,
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
