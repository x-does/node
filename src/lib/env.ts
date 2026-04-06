function clean(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function from(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = clean(process.env[key]);
    if (value) return value;
  }
  return undefined;
}

export function getWorkosApiKey(): string | undefined {
  return from('WORKOS_API_KEY', 'XDO_WORKOS_API_KEY');
}

export function getWorkosClientId(): string | undefined {
  return from('WORKOS_CLIENT_ID', 'XDO_WORKOS_CLIENT_ID');
}

export function getWorkosCookiePassword(): string | undefined {
  return from('WORKOS_COOKIE_PASSWORD', 'XDO_WORKOS_COOKIE_PASSWORD');
}

export function getWorkosRedirectUri(): string | undefined {
  return from('WORKOS_REDIRECT_URI', 'XDO_WORKOS_REDIRECT_URI');
}

export function getAppUrl(): string {
  return from('APP_URL', 'XDO_NODE_APP_URL') || 'http://localhost:3000';
}

export function normalizeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

export function getRequiredWorkosConfig() {
  const apiKey = getWorkosApiKey();
  const clientId = getWorkosClientId();
  const cookiePassword = getWorkosCookiePassword();
  const redirectUri = getWorkosRedirectUri();

  return {
    apiKey,
    clientId,
    cookiePassword,
    redirectUri,
    ready: Boolean(apiKey && clientId && cookiePassword && redirectUri),
  };
}
