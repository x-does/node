import crypto from 'crypto';
import { AUDIT_EVENT_KEY, buildAuditTelegramStartUrl } from '../../../lib/audit-config.js';
import { isLikelyAutomatedUserAgent, normalizeAuditSource } from '../../../lib/audit-source.js';
import { insertLeadEvent } from '../../../lib/db.js';
import { NO_STORE_CACHE_CONTROL } from '../../../lib/http-cache.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EVENT_KEY = AUDIT_EVENT_KEY;

function parseSource(url) {
  return normalizeAuditSource(url.searchParams.get('src'));
}

function parseEventKey(url) {
  return url.searchParams.get('event') || EVENT_KEY;
}

function getDestination(eventKey) {
  return buildAuditTelegramStartUrl(eventKey === EVENT_KEY ? EVENT_KEY : eventKey);
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
  const automatedUa = isLikelyAutomatedUserAgent(userAgent);

  try {
    await insertLeadEvent({
      eventKey,
      source,
      userAgent,
      ipHash,
      automatedUa,
    });
  } catch (error) {
    console.error('audit click insert failed', error);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      'Cache-Control': NO_STORE_CACHE_CONTROL,
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
