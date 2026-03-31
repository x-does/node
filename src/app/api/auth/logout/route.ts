import { NextRequest, NextResponse } from 'next/server';
import { getWorkOS } from '@/lib/workos';

export async function POST(request: NextRequest) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const origin = request.headers.get('origin');
  if (origin && origin !== appUrl) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const cookiePassword = process.env.WORKOS_COOKIE_PASSWORD;
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
