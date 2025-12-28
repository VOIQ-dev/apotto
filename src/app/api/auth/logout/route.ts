import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CookieMutation = {
  name: string;
  value: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any;
};

function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase の公開環境変数 (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) が設定されていません。'
    );
  }
  return { url, anonKey };
}

function createAuthClientForRequest(request: NextRequest) {
  const { url, anonKey } = getPublicSupabaseEnv();
  const cookieMutations: CookieMutation[] = [];
  const supabase = createServerClient(url, anonKey, {
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
  return { supabase, cookieMutations };
}

function applyAuthCookies(response: NextResponse, cookieMutations: CookieMutation[]) {
  for (const c of cookieMutations) {
    response.cookies.set(c.name, c.value, c.options);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, cookieMutations } = createAuthClientForRequest(request);
    await supabase.auth.signOut();

    const res = NextResponse.json({ success: true });
    applyAuthCookies(res, cookieMutations);
    // legacy cookie も消す（残っていても良いが、混乱を避ける）
    res.cookies.set('apotto_auth', '', { path: '/', maxAge: 0 });
    return res;
  } catch (err) {
    console.error('[auth/logout] Unexpected error', err);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}





