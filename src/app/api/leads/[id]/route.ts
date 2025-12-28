import { NextRequest, NextResponse } from 'next/server';

import {
  getAccountContextFromRequest,
  applyAuthCookies,
} from '@/lib/routeAuth';
import { createSupabaseServiceClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// PATCH: 個別リード編集
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { companyId, cookieMutations } = await getAccountContextFromRequest(request);
  if (!companyId) {
    const res = NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  const { id } = await context.params;
  if (!id) {
    const res = NextResponse.json({ error: 'リードIDが必要です' }, { status: 400 });
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // 編集可能フィールドのみ許可
    if (body.companyName !== undefined) updates.company_name = body.companyName;
    if (body.contactName !== undefined) updates.contact_name = body.contactName;
    if (body.department !== undefined) updates.department = body.department;
    if (body.title !== undefined) updates.title = body.title;
    if (body.email !== undefined) updates.email = body.email;
    if (body.isAppointed !== undefined) updates.is_appointed = body.isAppointed;
    if (body.isNg !== undefined) updates.is_ng = body.isNg;

    if (Object.keys(updates).length === 0) {
      const res = NextResponse.json({ error: '更新データがありません' }, { status: 400 });
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    updates.updated_at = new Date().toISOString();

    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('lead_lists')
      .update(updates)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[leads/patch] update error', error);
      const res = NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    if (!data) {
      const res = NextResponse.json({ error: 'リードが見つかりません' }, { status: 404 });
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const res = NextResponse.json({ lead: data });
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (err) {
    console.error('[leads/patch] error', err);
    const res = NextResponse.json({ error: '更新処理に失敗しました' }, { status: 500 });
    applyAuthCookies(res, cookieMutations);
    return res;
  }
}

