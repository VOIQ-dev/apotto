import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from './supabaseServer';

export type CookieMutation = {
  name: string;
  value: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any;
};

type AccountRow = {
  id: string;
  company_id: string;
  email: string;
  role: string;
  status: string;
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

export function applyAuthCookies(response: NextResponse, cookieMutations: CookieMutation[]) {
  for (const c of cookieMutations) {
    response.cookies.set(c.name, c.value, c.options);
  }
}

export async function getAuthUserFromRequest(
  request: NextRequest
): Promise<{ user: User | null; cookieMutations: CookieMutation[] }> {
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

  const { data } = await supabase.auth.getUser();
  return { user: data.user ?? null, cookieMutations };
}

export async function getAccountContextFromRequest(request: NextRequest): Promise<{
  user: User | null;
  cookieMutations: CookieMutation[];
  account: AccountRow | null;
  companyId: string | null;
  role: 'admin' | 'member' | null;
}> {
  const { user, cookieMutations } = await getAuthUserFromRequest(request);
  const email = user?.email ?? null;
  if (!email) {
    return { user, cookieMutations, account: null, companyId: null, role: null };
  }

  const supabase = createSupabaseServiceClient();
  const { data: account, error } = await supabase
    .from('accounts')
    .select('id, company_id, email, role, status')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.error('[routeAuth] accounts lookup failed', error);
  }

  const role = account?.role === 'admin' ? 'admin' : account?.role === 'member' ? 'member' : null;
  const companyId = account?.company_id ? String(account.company_id) : null;

  return {
    user,
    cookieMutations,
    account: (account as unknown as AccountRow) ?? null,
    companyId,
    role,
  };
}





