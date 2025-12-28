import { NextRequest, NextResponse } from 'next/server';

import { requireBackofficeAuth } from '@/lib/backofficeAuth';
import { createSupabaseServiceClient } from '@/lib/supabaseServer';
import { findAuthUserIdByEmail } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ companyId: string }>;
};

type UpdateCompanyBody = {
  name?: string;
  domain?: string;
  status?: string;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const denied = requireBackofficeAuth(request);
  if (denied) return denied;

  try {
    const { companyId } = await context.params;
    const id = String(companyId ?? '').trim();
    if (!id) return NextResponse.json({ error: 'companyId が不正です' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as UpdateCompanyBody;
    const payload: Record<string, unknown> = {};
    if (body.name !== undefined) payload.name = String(body.name).trim();
    if (body.domain !== undefined) payload.domain = String(body.domain).trim() || null;
    if (body.status !== undefined) payload.status = String(body.status).trim() || 'active';
    payload.updated_at = new Date().toISOString();

    if (payload.name !== undefined && !String(payload.name).trim()) {
      return NextResponse.json({ error: 'name は必須です' }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('companies')
      .update(payload)
      .eq('id', id)
      .select('id, name, domain, status, created_at, updated_at')
      .maybeSingle();

    if (error) {
      console.error('[backoffice/companies] update failed', error);
      return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true, company: data ?? null });
  } catch (err) {
    console.error('[backoffice/companies] Unexpected error', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const denied = requireBackofficeAuth(request);
  if (denied) return denied;

  try {
    const { companyId } = await context.params;
    const id = String(companyId ?? '').trim();
    if (!id) return NextResponse.json({ error: 'companyId が不正です' }, { status: 400 });

    const supabase = createSupabaseServiceClient();

    // 会社配下のアカウントを取得して Auth ユーザーも削除（best-effort）
    const { data: accounts, error: accountsErr } = await supabase
      .from('accounts')
      .select('id, email')
      .eq('company_id', id)
      .limit(5000);
    if (accountsErr) {
      console.error('[backoffice/companies] accounts lookup failed', accountsErr);
    } else {
      for (const row of accounts ?? []) {
        const email = String((row as { email?: unknown }).email ?? '').trim().toLowerCase();
        if (!email) continue;
        try {
          const userId = await findAuthUserIdByEmail(supabase, email);
          if (userId) await supabase.auth.admin.deleteUser(userId);
        } catch (e) {
          console.warn('[backoffice/companies] delete auth user failed', email, e);
        }
      }
    }

    // accounts はFK on delete cascade 前提だが、念のため先に削除
    await supabase.from('accounts').delete().eq('company_id', id);

    const { error } = await supabase.from('companies').delete().eq('id', id);
    if (error) {
      console.error('[backoffice/companies] delete failed', error);
      return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[backoffice/companies] Unexpected error', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}





