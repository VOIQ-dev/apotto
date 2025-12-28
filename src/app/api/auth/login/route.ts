import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RequestBody = {
  email?: string;
  password?: string;
};

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
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(body.password ?? '');

    if (!email || !password) {
      return NextResponse.json(
        { error: 'email と password は必須です' },
        { status: 400 }
      );
    }

    const { supabase, cookieMutations } = createAuthClientForRequest(request);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      const raw = String(error?.message ?? '');
      const msg = /email not confirmed/i.test(raw)
        ? 'メールアドレスが未確認です（Email not confirmed）'
        : /invalid login credentials/i.test(raw)
        ? 'メールアドレスまたはパスワードが正しくありません'
        : 'ログインに失敗しました';
      const res = NextResponse.json(
        { error: msg },
        { status: /email not confirmed/i.test(raw) ? 403 : 401 }
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    // DB側のアカウントを確認（会社スコープ等に必要）
    const service = createSupabaseServiceClient();
    const { data: account, error: accountErr } = await service
      .from('accounts')
      .select('id, status, activated_at')
      .eq('email', email)
      .maybeSingle();
    if (accountErr) {
      console.error('[auth/login] accounts lookup failed', accountErr);
    }
    const accountId = String((account as { id?: unknown } | null)?.id ?? '').trim();
    if (!accountId) {
      await supabase.auth.signOut().catch(() => null);
      const res = NextResponse.json(
        { error: 'アカウントが見つかりません' },
        { status: 403 }
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    // ログイン可視化のために最終ログイン日時を更新（=制御ではなく観測）
    const nowIso = new Date().toISOString();
    const status = String((account as { status?: unknown } | null)?.status ?? '').trim();
    const activatedAt = String(
      (account as { activated_at?: unknown } | null)?.activated_at ?? ''
    ).trim();
    const patch: Record<string, unknown> = {
      last_login_at: nowIso,
      updated_at: nowIso,
    };
    // 未ログイン状態(invited 等)はログイン済(active)へ更新
    if (status !== 'active') patch.status = 'active';
    if (!activatedAt) patch.activated_at = nowIso;
    const { error: updateErr } = await service
      .from('accounts')
      .update(patch)
      .eq('id', accountId);
    if (updateErr) {
      console.error('[auth/login] accounts update failed', updateErr);
    }

    const res = NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        metadata: data.user.user_metadata ?? {},
      },
    });
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (err) {
    console.error('[auth/login] Unexpected error', err);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}





