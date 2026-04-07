import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
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
