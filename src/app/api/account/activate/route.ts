import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '@/lib/supabaseServer';

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
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      const res = NextResponse.json({ error: '認証が必要です' }, { status: 401 });
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const email = data.user.email ?? null;
    if (!email) {
      const res = NextResponse.json(
        { error: 'ユーザー情報が不正です' },
        { status: 400 }
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const nowIso = new Date().toISOString();
    const service = createSupabaseServiceClient();
    const { data: updated, error: updateErr } = await service
      .from('accounts')
      .update({
        status: 'active',
        activated_at: nowIso,
        last_login_at: nowIso,
        updated_at: nowIso,
      })
      .eq('email', email)
      .select('id, company_id, email, role, status, activated_at')
      .maybeSingle();

    if (updateErr) {
      console.error('[account/activate] update failed', updateErr);
      const res = NextResponse.json(
        { error: 'アカウント更新に失敗しました' },
        { status: 500 }
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const res = NextResponse.json({ success: true, account: updated ?? null });
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (err) {
    console.error('[account/activate] Unexpected error', err);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}





