import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE = 'apotto_auth';
const PUBLIC_PATHS = new Set(['/login', '/favicon.ico']);
// プレフィックスで公開するパス
const PUBLIC_PREFIXES = ['/pdf/'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static')
  ) {
    return NextResponse.next();
  }

  // 公開パスのチェック（完全一致 or プレフィックス一致）
  const isPublic = PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthenticated = request.cookies.get(AUTH_COOKIE)?.value === '1';

  if (!isAuthenticated && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login' && isAuthenticated) {
    const dashboardUrl = new URL('/ai-custom', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

