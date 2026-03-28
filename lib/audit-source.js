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
    normalized.startsWith('verify_') ||
    normalized.startsWith('internal_') ||
    normalized.startsWith('monitor_')
  );
}
