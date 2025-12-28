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

export async function GET(request: NextRequest) {
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

    const service = createSupabaseServiceClient();
    const { data: account, error: accountErr } = await service
      .from('accounts')
      .select(
        'id, company_id, email, name, role, status, invited_at, activated_at, last_login_at, created_at, updated_at'
      )
      .eq('email', email)
      .maybeSingle();

    if (accountErr) {
      console.error('[account/me] accounts select failed', accountErr);
    }

    const companyId = account?.company_id ?? null;
    const { data: company, error: companyErr } = companyId
      ? await service
          .from('companies')
          .select('id, name, domain, status, created_at, updated_at')
          .eq('id', companyId)
          .maybeSingle()
      : { data: null, error: null };

    if (companyErr) {
      console.error('[account/me] companies select failed', companyErr);
    }

    const res = NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email,
        metadata: data.user.user_metadata ?? {},
      },
      account: account ?? null,
      company: company ?? null,
      mustChangePassword: Boolean(
        (data.user.user_metadata as Record<string, unknown> | null | undefined)
          ?.must_change_password
      ),
    });
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (err) {
    console.error('[account/me] Unexpected error', err);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}





