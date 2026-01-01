import { NextRequest, NextResponse } from "next/server";

import {
  getAccountContextFromRequest,
  applyAuthCookies,
} from "@/lib/routeAuth";
import { createSupabaseServiceClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH: 一括更新（送信ステータス、アポ獲得、NGフラグ等）
export async function PATCH(request: NextRequest) {
  const { companyId, cookieMutations } =
    await getAccountContextFromRequest(request);
  if (!companyId) {
    const res = NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  try {
    const body = await request.json();
    const { ids, updates } = body as {
      ids: string[];
      updates: {
        sendStatus?: string;
        pdfSendLogId?: string;
        isAppointed?: boolean;
        isNg?: boolean;
      };
    };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      const res = NextResponse.json(
        { error: "リードIDが必要です" },
        { status: 400 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const dbUpdates: Record<string, unknown> = {};

    if (updates.sendStatus !== undefined)
      dbUpdates.send_status = updates.sendStatus;
    if (updates.pdfSendLogId !== undefined)
      dbUpdates.pdf_send_log_id = updates.pdfSendLogId;
    if (updates.isAppointed !== undefined)
      dbUpdates.is_appointed = updates.isAppointed;
    if (updates.isNg !== undefined) dbUpdates.is_ng = updates.isNg;

    if (Object.keys(dbUpdates).length === 0) {
      const res = NextResponse.json(
        { error: "更新データがありません" },
        { status: 400 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    dbUpdates.updated_at = new Date().toISOString();

    const supabase = createSupabaseServiceClient();

    const { error } = await supabase
      .from("lead_lists")
      .update(dbUpdates)
      .in("id", ids)
      .eq("company_id", companyId);

    if (error) {
      console.error("[leads/bulk] update error", error);
      const res = NextResponse.json(
        { error: "一括更新に失敗しました" },
        { status: 500 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const res = NextResponse.json({
      message: "更新成功",
      updatedCount: ids.length,
    });
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (err) {
    console.error("[leads/bulk] error", err);
    const res = NextResponse.json(
      { error: "一括更新処理に失敗しました" },
      { status: 500 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }
}
