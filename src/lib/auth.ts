import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getWorkOS } from './workos';

const COOKIE_NAME = 'wos-session';

function cookiePassword(): string {
  const pw = process.env.WORKOS_COOKIE_PASSWORD;
  if (!pw) throw new Error('WORKOS_COOKIE_PASSWORD is not set');
  return pw;
}

interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
}

interface AuthResult {
  authenticated: true;
  user: AuthUser;
  sessionId: string;
}

interface UnauthResult {
  authenticated: false;
  user: null;
}

export type SessionResult = AuthResult | UnauthResult;

/**
 * Attempt to load and validate the sealed session from the cookie value.
 * If the access token has expired, tries a refresh and returns the new
 * sealed session string so the caller can update the cookie.
 */
export async function getSession(
  sessionData: string | undefined,
): Promise<SessionResult & { newSealedSession?: string }> {
  if (!sessionData) {
    return { authenticated: false, user: null };
  }

  const session = getWorkOS().userManagement.loadSealedSession({
    sessionData,
    cookiePassword: cookiePassword(),
  });

  const authResult = await session.authenticate();

  if (authResult.authenticated) {
    const u = authResult.user;
    return {
      authenticated: true,
      user: {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        profilePictureUrl: u.profilePictureUrl,
      },
      sessionId: authResult.sessionId,
    };
  }

  try {
    const refreshResult = await session.refresh();

    if (!refreshResult.authenticated) {
      return { authenticated: false, user: null };
    }

    const ru = refreshResult.user;
    return {
      authenticated: true,
      user: {
        id: ru.id,
        email: ru.email,
        firstName: ru.firstName,
        lastName: ru.lastName,
        profilePictureUrl: ru.profilePictureUrl,
      },
      sessionId: refreshResult.sessionId,
      newSealedSession: refreshResult.sealedSession,
    };
  } catch {
    return { authenticated: false, user: null };
  }
}

/**
 * Read the session from the request cookies.
 * Returns the user if authenticated, otherwise returns null.
 */
export async function getSessionFromCookies(): Promise<SessionResult> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME)?.value;
  return getSession(sessionCookie);
}

/**
 * Require authentication for a server component or route handler.
 * Redirects to /api/auth/login if the user is not authenticated.
 */
export async function requireAuth(): Promise<AuthResult> {
  const result = await getSessionFromCookies();
  if (!result.authenticated) {
    redirect('/api/auth/login');
  }
  return result;
}

/**
 * Get the current user without redirecting.
 * Returns the user if authenticated, otherwise returns null.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const result = await getSessionFromCookies();
  if (!result.authenticated) {
    return null;
  }
  return result.user;
}