import { NextRequest, NextResponse } from 'next/server';
import { getWorkOS } from '@/lib/workos';
import { getAppUrl, getWorkosCookiePassword, normalizeOrigin } from '@/lib/env';

export async function POST(request: NextRequest) {
  const appUrl = getAppUrl();
  const origin = request.headers.get('origin');
  const appOrigin = normalizeOrigin(appUrl);

  if (origin && normalizeOrigin(origin) !== appOrigin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const cookiePassword = getWorkosCookiePassword();
  const sessionData = request.cookies.get('wos-session')?.value;

  if (!sessionData || !cookiePassword) {
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.delete('wos-session');
    return response;
  }

  try {
    const session = getWorkOS().userManagement.loadSealedSession({
      sessionData,
      cookiePassword,
    });

    const logoutUrl = await session.getLogoutUrl();
    const response = NextResponse.redirect(logoutUrl);
    response.cookies.delete('wos-session');
    return response;
  } catch (error) {
    console.error('[auth/logout] failed:', error);
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.delete('wos-session');
    return response;
  }
}
