import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const AUTH_COOKIE = 'apotto_auth';
const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/favicon.ico',
  '/billing',
  '/billing/success',
  '/billing/cancel',
]);
// プレフィックスで公開するパス
const PUBLIC_PREFIXES = ['/pdf/', '/billing/'];
const FIRST_LOGIN_PATH = '/first-login';
const BACKOFFICE_PREFIX = '/backoffice';
const BACKOFFICE_LOGIN_PATH = '/backoffice/login';

// 静的アセットの拡張子
const STATIC_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|woff|woff2|ttf|eot|mjs)$/i;

type CookieMutation = {
  name: string;
  value: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any;
};

function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function applyAuthCookies(response: NextResponse, cookieMutations: CookieMutation[]) {
  for (const c of cookieMutations) {
    response.cookies.set(c.name, c.value, c.options);
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 静的ファイル・Next.js内部パス・APIはスキップ
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    STATIC_EXTENSIONS.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Backoffice はアプリ認証とは別系統で扱う（アプリ未ログインでも /login へ飛ばさない）
  if (pathname.startsWith(BACKOFFICE_PREFIX)) {
    const isBackofficeLogin = pathname === BACKOFFICE_LOGIN_PATH;
    const isBackofficeAuthenticated =
      request.cookies.get('backoffice_auth')?.value === '1';

    if (!isBackofficeAuthenticated && !isBackofficeLogin) {
      const loginUrl = new URL(BACKOFFICE_LOGIN_PATH, request.url);
      return NextResponse.redirect(loginUrl);
    }

    if (isBackofficeAuthenticated && isBackofficeLogin) {
      const companiesUrl = new URL('/backoffice/companies', request.url);
      return NextResponse.redirect(companiesUrl);
    }

    return NextResponse.next();
  }

  // 公開パスのチェック（完全一致 or プレフィックス一致）
  const isPublic =
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isLegacyAuthenticated = request.cookies.get(AUTH_COOKIE)?.value === '1';

  // Supabase Auth（あれば優先）: セッション確認 + 必要なら Cookie を更新
  const env = getPublicSupabaseEnv();
  const cookieMutations: CookieMutation[] = [];
  const supabaseUser = env
    ? await (async () => {
        const supabase = createServerClient(env.url, env.anonKey, {
          cookies: {
            get(name) {
              return request.cookies.get(name)?.value;
            },
            set(name, value, options) {
              cookieMutations.push({ name, value, options });
            },
            remove(name, options) {
              cookieMutations.push({
                name,
                value: '',
                options: { ...options, maxAge: 0 },
              });
            },
          },
        });

        const { data } = await supabase.auth.getUser();
        return data.user ?? null;
      })()
    : null;

  const isAuthenticated = Boolean(supabaseUser) || isLegacyAuthenticated;
  const mustChangePassword = Boolean(
    (supabaseUser?.user_metadata as Record<string, unknown> | null | undefined)
      ?.must_change_password
  );

  if (!isAuthenticated && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    const res = NextResponse.redirect(loginUrl);
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  // 初回ログイン（パスワード変更必須）は first-login に強制誘導
  if (supabaseUser && mustChangePassword && pathname !== FIRST_LOGIN_PATH) {
    // 公開パスはそのまま（PDF閲覧等）
    if (!isPublic) {
      const firstLoginUrl = new URL(FIRST_LOGIN_PATH, request.url);
      const res = NextResponse.redirect(firstLoginUrl);
      applyAuthCookies(res, cookieMutations);
      return res;
    }
  }

  // /login は「いつでも開ける」ように自動リダイレクトしない
  // （ログイン済みでも別アカウントで入り直せるようにする）

  const res = NextResponse.next();
  applyAuthCookies(res, cookieMutations);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

