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
  return (
    source.startsWith('deploy_probe') ||
    source.startsWith('verify_') ||
    source.startsWith('internal_') ||
    source.startsWith('monitor_')
  );
}
