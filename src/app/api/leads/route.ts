import { NextRequest, NextResponse } from "next/server";

import {
  getAccountContextFromRequest,
  applyAuthCookies,
  createSessionInvalidResponse,
} from "@/lib/routeAuth";
import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import { LeadImportSchema, formatZodErrors } from "@/lib/schemas";
import { ErrorMessages, createErrorResponse, logError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * URLを正規化して重複チェックに使用
 * - 末尾のスラッシュを削除
 * - ホスト名を小文字化
 * - 前後の空白を削除
 */
function normalizeUrlForComparison(url: string): string {
  try {
    const trimmed = url.trim();
    const urlObj = new URL(trimmed);
    // ホスト名を小文字化
    urlObj.hostname = urlObj.hostname.toLowerCase();
    // 末尾のスラッシュを削除
    let normalized = urlObj.toString();
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    // URLパースに失敗した場合は、そのまま返す（バリデーションは別で行われる）
    return url.trim().toLowerCase();
  }
}

// GET: リード一覧取得（ページネーション対応）
export async function GET(request: NextRequest) {
  const { companyId, cookieMutations, sessionValid, account } =
    await getAccountContextFromRequest(request);

  // セッション無効チェック（同時ログイン制限）
  if (!sessionValid) {
    console.error("[GET /api/leads] Session invalid", {
      email: account?.email,
      companyId,
      hasAccount: !!account,
    });
    return createSessionInvalidResponse(cookieMutations);
  }

  if (!companyId) {
    console.error("[GET /api/leads] Unauthorized - No company ID", {
      email: account?.email,
      hasAccount: !!account,
    });
    const res = NextResponse.json(
      createErrorResponse(ErrorMessages.AUTH.UNAUTHORIZED),
      { status: 401 },
    );
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
    logError("GET /api/leads - DB Fetch Error", error, {
      companyId,
      email: account?.email,
      accountId: account?.id,
      page,
      limit,
      offset,
    });
    const res = NextResponse.json(
      createErrorResponse(ErrorMessages.SERVER.DATABASE_ERROR),
      { status: 500 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  // アプローチ優先度計算のため、関連するpdf_send_logsとpdf_open_eventsを取得
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

// PATCH: 送信結果をhomepageUrlで更新
export async function PATCH(request: NextRequest) {
  const { companyId, cookieMutations, sessionValid } =
    await getAccountContextFromRequest(request);

  if (!sessionValid) {
    return createSessionInvalidResponse(cookieMutations);
  }

  if (!companyId) {
    const res = NextResponse.json(
      createErrorResponse(ErrorMessages.AUTH.UNAUTHORIZED),
      { status: 401 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  try {
    const body = await request.json();
    const { homepageUrl, sendStatus } = body;

    if (!homepageUrl || !sendStatus) {
      const res = NextResponse.json(
        { error: "homepageUrl and sendStatus are required" },
        { status: 400 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const supabase = createSupabaseServiceClient();

    const { data, error, count } = await supabase
      .from("lead_lists")
      .update({ send_status: sendStatus }, { count: "exact" })
      .eq("company_id", companyId)
      .eq("homepage_url", homepageUrl)
      .select();

    if (error) {
      console.error("[PATCH /api/leads] DB error:", error);
      logError("leads", error, { context: "update send_status" });
      const res = NextResponse.json(
        createErrorResponse(ErrorMessages.SERVER.DATABASE_ERROR),
        { status: 500 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    if (!count || count === 0) {
      console.warn(`[PATCH /api/leads] No lead found for URL: ${homepageUrl}`);
      const res = NextResponse.json(
        { success: false, message: "Lead not found", homepageUrl },
        { status: 404 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    console.log(
      `[PATCH /api/leads] Updated ${count} lead(s) for URL: ${homepageUrl} -> ${sendStatus}`,
    );
    const res = NextResponse.json({ success: true, updated: count });
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (err) {
    logError("leads", err, { context: "PATCH error" });
    const res = NextResponse.json(
      createErrorResponse(ErrorMessages.SERVER.INTERNAL_ERROR),
      { status: 500 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }
}

// POST: CSVインポート（差分マージ）
export async function POST(request: NextRequest) {
  const { companyId, cookieMutations, sessionValid, account } =
    await getAccountContextFromRequest(request);

  if (!sessionValid) {
    console.error("[POST /api/leads] Session invalid", {
      email: account?.email,
      companyId,
    });
    return createSessionInvalidResponse(cookieMutations);
  }

  if (!companyId) {
    console.error("[POST /api/leads] Unauthorized - No company ID", {
      email: account?.email,
      hasAccount: !!account,
    });
    const res = NextResponse.json(
      createErrorResponse(ErrorMessages.AUTH.UNAUTHORIZED),
      { status: 401 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  try {
    const rawBody = await request.json();

    // Zodバリデーション
    const validation = LeadImportSchema.safeParse(rawBody);

    if (!validation.success) {
      const { message, fields } = formatZodErrors(validation.error);
      console.error("[POST /api/leads] Validation failed", {
        companyId,
        email: account?.email,
        accountId: account?.id,
        fileName: rawBody?.fileName,
        leadsCount: Array.isArray(rawBody?.leads) ? rawBody.leads.length : 0,
        validationErrors: fields,
      });
      const res = NextResponse.json(
        { error: message, errors: fields },
        { status: 400 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const { leads, fileName } = validation.data;

    console.info("[POST /api/leads] Import started", {
      companyId,
      email: account?.email,
      accountId: account?.id,
      fileName,
      totalLeads: leads.length,
    });

    const supabase = createSupabaseServiceClient();

    // 既存データのURL一覧を取得
    const { data: existingLeads } = await supabase
      .from("lead_lists")
      .select("homepage_url")
      .eq("company_id", companyId);

    // 既存URLを正規化してSetに格納
    const existingUrls = new Set(
      (existingLeads || []).map((l) =>
        normalizeUrlForComparison(l.homepage_url),
      ),
    );

    // CSVファイル内の重複も検出
    const csvUrls = new Set<string>();
    const csvDuplicates: string[] = [];

    // 差分のみ抽出（新規データのURLも正規化して比較）
    const newLeads = leads.filter((l) => {
      const normalizedUrl = normalizeUrlForComparison(l.homepageUrl);

      // CSV内の重複チェック
      if (csvUrls.has(normalizedUrl)) {
        csvDuplicates.push(l.homepageUrl);
        return false; // CSV内で重複しているので除外
      }
      csvUrls.add(normalizedUrl);

      // 既存データとの重複チェック
      return !existingUrls.has(normalizedUrl);
    });
    const existingCount = leads.length - newLeads.length;

    // CSV内の重複があればログに記録
    if (csvDuplicates.length > 0) {
      console.warn("[POST /api/leads] CSV内に重複URLを検出", {
        companyId,
        email: account?.email,
        fileName,
        duplicateCount: csvDuplicates.length,
        examples: csvDuplicates.slice(0, 5), // 最初の5件のみ表示
      });
    }

    if (newLeads.length === 0) {
      const message =
        csvDuplicates.length > 0
          ? `新規リードはありません（既存データとの重複: ${existingCount}件、CSV内の重複: ${csvDuplicates.length}件）`
          : "新規リードはありません（全て重複）";
      const res = NextResponse.json({
        message,
        imported: 0,
        duplicates: existingCount,
        csvDuplicates: csvDuplicates.length,
        isFirstImport: existingUrls.size === 0,
      });
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    // 新規リードを挿入（URLを正規化して保存）
    const insertData = newLeads.map((l) => ({
      company_id: companyId,
      homepage_url: normalizeUrlForComparison(l.homepageUrl),
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
      logError("POST /api/leads - DB Insert Error", insertError, {
        companyId,
        email: account?.email,
        accountId: account?.id,
        fileName,
        newLeadsCount: newLeads.length,
        duplicatesCount: existingCount,
        totalSubmitted: leads.length,
      });
      const res = NextResponse.json(
        createErrorResponse(ErrorMessages.RESOURCE.CREATION_FAILED),
        { status: 500 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    console.info("[POST /api/leads] Import completed", {
      companyId,
      email: account?.email,
      accountId: account?.id,
      fileName,
      imported: newLeads.length,
      duplicates: existingCount,
      csvDuplicates: csvDuplicates.length,
      totalSubmitted: leads.length,
      isFirstImport: existingUrls.size === 0,
    });

    const res = NextResponse.json({
      message: "インポート成功",
      imported: newLeads.length,
      duplicates: existingCount,
      csvDuplicates: csvDuplicates.length,
      isFirstImport: existingUrls.size === 0,
    });
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (err) {
    logError("POST /api/leads - Import Processing Error", err, {
      companyId,
      email: account?.email,
      accountId: account?.id,
      errorType: err instanceof Error ? err.name : typeof err,
    });
    const res = NextResponse.json(
      createErrorResponse(ErrorMessages.SERVER.INTERNAL_ERROR),
      { status: 500 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }
}
