import { NextRequest, NextResponse } from 'next/server';

import { requireBackofficeAuth } from '@/lib/backofficeAuth';
import { createSupabaseServiceClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CompanyRow = {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  accounts?: unknown;
};

type AccountRow = {
  id: string;
  company_id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  invited_at: string | null;
  activated_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type CreateCompanyBody = {
  name?: string;
  domain?: string;
};

export async function GET(request: NextRequest) {
  const denied = requireBackofficeAuth(request);
  if (denied) return denied;

  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('companies')
      .select(
        'id, name, domain, status, created_at, updated_at, accounts:accounts(id, company_id, email, name, role, status, invited_at, activated_at, last_login_at, created_at, updated_at)'
      )
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) {
      console.error('[backoffice/companies] select failed', error);
      return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
    }

    const companies = ((data ?? []) as unknown as CompanyRow[]).map((c) => {
      const accountsRaw = (c as { accounts?: unknown }).accounts;
      const accounts = (Array.isArray(accountsRaw) ? accountsRaw : []) as unknown as AccountRow[];
      accounts.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      return {
        ...c,
        accounts,
        accountCount: accounts.length,
      };
    });

    return NextResponse.json({ companies });
  } catch (err) {
    console.error('[backoffice/companies] Unexpected error', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = requireBackofficeAuth(request);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => ({}))) as CreateCompanyBody;
    const name = String(body.name ?? '').trim();
    const domain = String(body.domain ?? '').trim() || null;

    if (!name) {
      return NextResponse.json({ error: 'name は必須です' }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('companies')
      .insert({ name, domain, status: 'active' })
      .select('id, name, domain, status, created_at, updated_at')
      .single();

    if (error || !data) {
      console.error('[backoffice/companies] insert failed', error);
      return NextResponse.json({ error: '作成に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true, company: data });
  } catch (err) {
    console.error('[backoffice/companies] Unexpected error', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}





