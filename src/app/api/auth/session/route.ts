import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const sessionData = request.cookies.get('wos-session')?.value;
  const result = await getSession(sessionData);

  if (!result.authenticated) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  const response = NextResponse.json({
    authenticated: true,
    user: {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      profilePictureUrl: result.user.profilePictureUrl,
    },
  });

  if ('newSealedSession' in result && result.newSealedSession) {
    const isProduction = process.env.NODE_ENV === 'production';
    response.cookies.set('wos-session', result.newSealedSession, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
    });
  }

  return response;
}
