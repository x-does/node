export function normalizeAuditSource(rawSource) {
  if (!rawSource) {
    return 'unknown';
  }

  const cleaned = String(rawSource)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

  return cleaned || 'unknown';
}

export function isInternalAuditSource(source) {
  const normalized = normalizeAuditSource(source);

  return (
    normalized.startsWith('deploy_probe') ||
    normalized.startsWith('probe_') ||
    normalized.startsWith('verify_') ||
    normalized.startsWith('internal_') ||
    normalized.startsWith('monitor_')
  );
}

export function isLikelyAutomatedUserAgent(userAgent) {
  if (!userAgent) {
    return false;
  }

  const ua = String(userAgent).toLowerCase();

  return [
    'bot',
    'spider',
    'crawler',
    'preview',
    'headless',
    'curl/',
    'wget/',
    'facebookexternalhit',
    'slackbot',
    'discordbot',
    'linkedinbot',
    'twitterbot',
    'whatsapp',
    'uptimerobot',
    'pingdom',
    'checkly',
  ].some((token) => ua.includes(token));
}
