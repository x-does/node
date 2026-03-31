export const AUDIT_EVENT_KEY = 'node_audit_20260328';
export const ROOT_PARITY_MARKER = 'Build the money loop.';
export const AUDIT_TELEGRAM_BOT = 'world_fuckery_bot';

export function buildAuditTelegramStartUrl(eventKey = AUDIT_EVENT_KEY) {
  return `https://t.me/${AUDIT_TELEGRAM_BOT}?start=${encodeURIComponent(eventKey)}`;
}

export function buildAuditClickHref(source = 'hero_primary', eventKey = AUDIT_EVENT_KEY) {
  const query = new URLSearchParams({ src: source, event: eventKey });
  return `/api/audit-click?${query.toString()}`;
}
