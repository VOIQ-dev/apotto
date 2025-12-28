import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

import { requireBackofficeAuth } from '@/lib/backofficeAuth';
import { createSupabaseServiceClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ companyId: string }>;
};

type CreateAccountBody = {
  email?: string;
  name?: string;
  role?: 'admin' | 'member';
};

function normalizeEmail(input: unknown): string {
  return String(input ?? '')
    .trim()
    .toLowerCase();
}

function generateInitialPassword(): string {
  return randomBytes(16).toString('base64url');
}

export async function POST(request: NextRequest, context: RouteContext) {
  const denied = requireBackofficeAuth(request);
  if (denied) return denied;

  try {
    const { companyId } = await context.params;
    const cid = String(companyId ?? '').trim();
    if (!cid) return NextResponse.json({ error: 'companyId が不正です' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as CreateAccountBody;
    const email = normalizeEmail(body.email);
    const name = String(body.name ?? '').trim() || null;
    const role = (body.role ?? 'member') as 'admin' | 'member';

    if (!email) return NextResponse.json({ error: 'email は必須です' }, { status: 400 });

    const supabase = createSupabaseServiceClient();

    // 会社存在確認
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id')
      .eq('id', cid)
      .maybeSingle();
    if (companyErr) {
      console.error('[backoffice/accounts] company lookup failed', companyErr);
      return NextResponse.json({ error: '会社の確認に失敗しました' }, { status: 500 });
    }
    if (!company) return NextResponse.json({ error: '会社が見つかりません' }, { status: 404 });

    // 重複チェック
    const { data: existing, error: existingErr } = await supabase
      .from('accounts')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingErr) {
      console.error('[backoffice/accounts] duplicate check failed', existingErr);
      return NextResponse.json({ error: 'アカウント確認に失敗しました' }, { status: 500 });
    }
    if (existing?.id) {
      return NextResponse.json({ error: 'そのメールアドレスは既に登録されています' }, { status: 409 });
    }

    const initialPassword = generateInitialPassword();

    // Authユーザー作成（初回ログインでPW変更）
    const { data: created, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: {
        company_id: cid,
        role,
        must_change_password: true,
      },
    });
    if (authErr || !created.user) {
      console.error('[backoffice/accounts] auth create failed', authErr);
      const isDuplicate = /already registered|exists/i.test(String(authErr?.message ?? ''));
      return NextResponse.json(
        { error: isDuplicate ? 'そのメールアドレスは既に登録されています' : '作成に失敗しました' },
        { status: isDuplicate ? 409 : 500 }
      );
    }

    const nowIso = new Date().toISOString();
    const { data: account, error: insertErr } = await supabase
      .from('accounts')
      .insert({
        company_id: cid,
        email,
        name,
        role,
        status: 'invited',
        invited_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, company_id, email, name, role, status, invited_at, activated_at, created_at, updated_at')
      .single();

    if (insertErr || !account) {
      console.error('[backoffice/accounts] accounts insert failed', insertErr);
      // cleanup auth user
      await supabase.auth.admin.deleteUser(created.user.id).catch(() => null);
      return NextResponse.json({ error: '作成に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      account,
      initialPassword,
      note: '初回ログインでパスワード変更を促します。',
    });
  } catch (err) {
    console.error('[backoffice/accounts] Unexpected error', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}





