export function normalizeAuditSource(rawSource: string | null | undefined): string {
  if (!rawSource) return 'unknown';

  const cleaned = String(rawSource)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

  return cleaned || 'unknown';
}

export function isInternalAuditSource(source: string): boolean {
  const normalized = normalizeAuditSource(source);
  return (
    normalized.startsWith('deploy_probe') ||
    normalized.startsWith('probe_') ||
    normalized.startsWith('verify_') ||
    normalized.startsWith('internal_') ||
    normalized.startsWith('monitor_')
  );
}

const AUTOMATED_UA_TOKENS = [
  'bot', 'spider', 'crawler', 'preview', 'headless',
  'curl/', 'wget/', 'facebookexternalhit', 'slackbot',
  'discordbot', 'linkedinbot', 'twitterbot', 'whatsapp',
  'uptimerobot', 'pingdom', 'checkly',
];

export function isLikelyAutomatedUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = String(userAgent).toLowerCase();
  return AUTOMATED_UA_TOKENS.some((token) => ua.includes(token));
}
