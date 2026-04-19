import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

function randomHex(size = 24) {
  return crypto.randomBytes(size).toString('hex');
}

function appOrigin(request: NextRequest) {
  const configured = process.env.APP_URL || process.env.XDO_NODE_APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {}
  }
  return request.nextUrl.origin;
}

export async function buildBlogEditAuthStartResponse(request: NextRequest) {
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
  const redirectUri = `${appOrigin(request)}/api/blog-edit/auth/callback`;

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

export async function buildBlogEditAuthCallbackResponse(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const storedState = request.cookies.get('blogedit_oauth_state')?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return new NextResponse(
      `<html><body><script>window.opener?.postMessage({type:'BLOG_EDIT_AUTH_ERROR',error:'Invalid OAuth state/code'}, window.location.origin); window.close();</script></body></html>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 400 },
    );
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return new NextResponse(
      `<html><body><script>window.opener?.postMessage({type:'BLOG_EDIT_AUTH_ERROR',error:'GitHub OAuth server env is not configured'}, window.location.origin); window.close();</script></body></html>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 500 },
    );
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      state,
    }),
  });

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenJson.access_token) {
    return new NextResponse(
      `<html><body><script>window.opener?.postMessage({type:'BLOG_EDIT_AUTH_ERROR',error:${JSON.stringify(
        tokenJson.error_description || tokenJson.error || 'Token exchange failed',
      )}}, window.location.origin); window.close();</script></body></html>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 400 },
    );
  }

  return new NextResponse(
    `<html><body><script>window.opener?.postMessage({type:'BLOG_EDIT_AUTH_SUCCESS',token:${JSON.stringify(
      tokenJson.access_token,
    )},scope:${JSON.stringify(tokenJson.scope || '')}}, window.location.origin); window.close();</script></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
