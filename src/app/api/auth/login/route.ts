import { NextResponse } from 'next/server';
import { getWorkOS } from '@/lib/workos';

export async function GET() {
  const clientId = process.env.WORKOS_CLIENT_ID;
  const redirectUri = process.env.WORKOS_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'WorkOS is not configured' },
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
