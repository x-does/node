import { NextResponse } from 'next/server';

const NO_STORE = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0';

export function middleware(request) {
  const response = NextResponse.next();

  if (request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/api/health') {
    response.headers.set('Cache-Control', NO_STORE);
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
}

export const config = {
  matcher: ['/', '/api/health'],
};
