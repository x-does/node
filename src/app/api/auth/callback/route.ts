import { NextRequest, NextResponse } from 'next/server';
import { getWorkOS } from '@/lib/workos';
import { getWorkosClientId, getWorkosCookiePassword } from '@/lib/env';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/api/auth/login', request.url));
  }

  const clientId = getWorkosClientId();
  const cookiePassword = getWorkosCookiePassword();

  if (!clientId || !cookiePassword) {
    return NextResponse.json(
      { error: 'WorkOS is not configured (client id / cookie password missing)' },
      { status: 500 },
    );
  }

  try {
    const { sealedSession } = await getWorkOS().userManagement.authenticateWithCode({
      clientId,
      code,
      session: {
        sealSession: true,
        cookiePassword,
      },
    });

    const response = NextResponse.redirect(new URL('/', request.url));
    const isProduction = process.env.NODE_ENV === 'production';

    response.cookies.set('wos-session', sealedSession!, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    console.error('[auth/callback] authentication failed:', error);
    return NextResponse.redirect(new URL('/api/auth/login', request.url));
  }
}
