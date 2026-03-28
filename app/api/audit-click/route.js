import crypto from 'crypto';
import { insertLeadEvent } from '../../../lib/db.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EVENT_KEY = 'node_audit_20260328';
const DESTINATION = 'https://t.me/world_fuckery_bot?start=node_audit_20260328';
const NO_STORE = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0';

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
  const source = url.searchParams.get('src') || 'unknown';
  const userAgent = request.headers.get('user-agent') || null;
  const ipHash = hashIp(getClientIp(request));

  try {
    await insertLeadEvent({
      eventKey: EVENT_KEY,
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
      Location: DESTINATION,
      'Cache-Control': NO_STORE,
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
