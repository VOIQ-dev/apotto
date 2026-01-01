import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import {
  applyAuthCookies,
  getAccountContextFromRequest,
} from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SendStatsResponse = {
  success: number;
  failed: number;
  blocked: number;
  pending: number;
  total: number;
};

export async function GET(request: NextRequest) {
  try {
    const { user, companyId, cookieMutations } =
      await getAccountContextFromRequest(request);
    const json = (body: unknown, init?: { status?: number }) => {
      const res = NextResponse.json(body, { status: init?.status });
      applyAuthCookies(res, cookieMutations);
      return res;
    };

    if (!user) return json({ error: "認証が必要です" }, { status: 401 });
    if (!companyId)
      return json({ error: "会社情報が紐づいていません" }, { status: 403 });

    const supabase = createSupabaseServiceClient();

    // lead_listsから send_status を集計
    const { data: leads, error: leadsErr } = await supabase
      .from("lead_lists")
      .select("send_status")
      .eq("company_id", companyId)
      .limit(10000);

    if (leadsErr) {
      console.error("[dashboard/send-stats] leads error", leadsErr);
      return json({ error: "データ取得に失敗しました" }, { status: 500 });
    }

    const stats: SendStatsResponse = {
      success: 0,
      failed: 0,
      blocked: 0,
      pending: 0,
      total: 0,
    };

    for (const lead of leads ?? []) {
      const status = (lead as { send_status?: string | null }).send_status;
      stats.total += 1;
      if (status === "success") {
        stats.success += 1;
      } else if (status === "failed") {
        stats.failed += 1;
      } else if (status === "blocked") {
        stats.blocked += 1;
      } else {
        stats.pending += 1;
      }
    }

    return json(stats);
  } catch (err) {
    console.error("[dashboard/send-stats] Unexpected error", err);
    return NextResponse.json(
      { error: "データ取得に失敗しました。" },
      { status: 500 },
    );
  }
}
