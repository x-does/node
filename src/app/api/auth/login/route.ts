import { NextResponse } from 'next/server';
import { getWorkOS } from '@/lib/workos';
import { getWorkosClientId, getWorkosRedirectUri } from '@/lib/env';

export async function GET() {
  const clientId = getWorkosClientId();
  const redirectUri = getWorkosRedirectUri();

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'WorkOS is not configured (client id / redirect uri missing)' },
      { status: 500 },
    );
  }

  const authorizationUrl = getWorkOS().userManagement.getAuthorizationUrl({
    provider: 'authkit',
    redirectUri,
    clientId,
  });

  return NextResponse.redirect(authorizationUrl);
}
