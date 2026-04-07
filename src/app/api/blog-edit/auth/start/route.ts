import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

function randomHex(size = 24) {
  return crypto.randomBytes(size).toString('hex');
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      {
        ok: false,
        error: 'GITHUB_OAUTH_CLIENT_ID is missing in server env',
      },
      { status: 500 },
    );
  }

  const state = randomHex(16);
  const redirectUri = new URL('/api/blog-edit/auth/callback', request.url).toString();

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'repo read:user');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('allow_signup', 'true');

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('blogedit_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  });

  return response;
}
