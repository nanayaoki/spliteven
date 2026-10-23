import { NextResponse } from 'next/server';

export function middleware(request) {
  if (!request.cookies.has('splitsmart_session') && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/', '/login', '/api/auth/:path*'] };
