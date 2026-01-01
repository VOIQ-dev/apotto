import { NextRequest, NextResponse } from "next/server";

import {
  getAccountContextFromRequest,
  applyAuthCookies,
} from "@/lib/routeAuth";
import { createSupabaseServiceClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: リード一覧取得（ページネーション対応）
export async function GET(request: NextRequest) {
  const { companyId, cookieMutations } =
    await getAccountContextFromRequest(request);
  if (!companyId) {
    const res = NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10)),
  );
  const offset = (page - 1) * limit;

  const supabase = createSupabaseServiceClient();

  // リード一覧取得
  const {
    data: leads,
    error,
    count,
  } = await supabase
    .from("lead_lists")
    .select("*", { count: "exact" })
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[leads] fetch error", error);
    const res = NextResponse.json(
      { error: "リード取得に失敗しました" },
      { status: 500 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  // インテントスコア計算のため、関連するpdf_send_logsとpdf_open_eventsを取得
  const leadsWithScore = await Promise.all(
    (leads || []).map(async (lead) => {
      let intentScore: number | null = null;

      if (lead.pdf_send_log_id) {
        // 送信ログから送信日時を取得
        const { data: sendLog } = await supabase
          .from("pdf_send_logs")
          .select("sent_at")
          .eq("id", lead.pdf_send_log_id)
          .maybeSingle();

        if (sendLog?.sent_at) {
          // 開封イベントを取得
          const { data: openEvent } = await supabase
            .from("pdf_open_events")
            .select("opened_at")
            .eq("pdf_send_log_id", lead.pdf_send_log_id)
            .order("opened_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (openEvent?.opened_at) {
            const sentAt = new Date(sendLog.sent_at).getTime();
            const openedAt = new Date(openEvent.opened_at).getTime();
            const diffHours = (openedAt - sentAt) / (1000 * 60 * 60);

            if (diffHours <= 24) {
              intentScore = 90; // High
            } else if (diffHours <= 72) {
              intentScore = 60; // Medium
            } else {
              intentScore = 30; // Low
            }
          } else {
            intentScore = 0; // 未開封
          }
        }
      }

      return {
        ...lead,
        intentScore,
      };
    }),
  );

  const res = NextResponse.json({
    leads: leadsWithScore,
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
  applyAuthCookies(res, cookieMutations);
  return res;
}

// POST: CSVインポート（差分マージ）
export async function POST(request: NextRequest) {
  const { companyId, cookieMutations } =
    await getAccountContextFromRequest(request);
  if (!companyId) {
    const res = NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  try {
    const body = await request.json();
    const { leads, fileName } = body as {
      leads: Array<{
        companyName: string;
        homepageUrl: string;
        contactName?: string;
        department?: string;
        title?: string;
        email?: string;
      }>;
      fileName?: string;
    };

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      const res = NextResponse.json(
        { error: "リードデータが必要です" },
        { status: 400 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const supabase = createSupabaseServiceClient();

    // 既存データのURL一覧を取得
    const { data: existingLeads } = await supabase
      .from("lead_lists")
      .select("homepage_url")
      .eq("company_id", companyId);

    const existingUrls = new Set(
      (existingLeads || []).map((l) => l.homepage_url),
    );

    // 差分のみ抽出
    const newLeads = leads.filter((l) => !existingUrls.has(l.homepageUrl));
    const existingCount = leads.length - newLeads.length;

    if (newLeads.length === 0) {
      const res = NextResponse.json({
        message: "新規リードはありません（全て重複）",
        imported: 0,
        duplicates: existingCount,
        isFirstImport: existingUrls.size === 0,
      });
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    // 新規リードを挿入
    const insertData = newLeads.map((l) => ({
      company_id: companyId,
      homepage_url: l.homepageUrl,
      company_name: l.companyName,
      contact_name: l.contactName || null,
      department: l.department || null,
      title: l.title || null,
      email: l.email || null,
      send_status: "pending",
      is_appointed: false,
      is_ng: false,
      import_file_name: fileName || null,
    }));

    const { error: insertError } = await supabase
      .from("lead_lists")
      .insert(insertData);

    if (insertError) {
      console.error("[leads] import error", insertError);
      const res = NextResponse.json(
        { error: "インポートに失敗しました" },
        { status: 500 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const res = NextResponse.json({
      message: "インポート成功",
      imported: newLeads.length,
      duplicates: existingCount,
      isFirstImport: existingUrls.size === 0,
    });
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (err) {
    console.error("[leads] import error", err);
    const res = NextResponse.json(
      { error: "インポート処理に失敗しました" },
      { status: 500 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }
}
