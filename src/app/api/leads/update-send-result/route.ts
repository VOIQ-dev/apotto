import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAccountContextFromRequest,
  applyAuthCookies,
  createSessionInvalidResponse,
} from "@/lib/routeAuth";

// Supabase Admin クライアント（サービスロールキー使用）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  // サーバーサイドのセッションから認証情報を取得（tryの外で取得）
  const { companyId, cookieMutations, sessionValid } =
    await getAccountContextFromRequest(req);

  try {
    console.log("[API] update-send-result authentication check:", {
      companyId,
      sessionValid,
      origin: req.headers.get("origin"),
    });

    // セッション無効チェック
    if (!sessionValid) {
      console.error("[API] Session invalid");
      return createSessionInvalidResponse(cookieMutations);
    }

    // 認証チェック（セッションから取得したcompanyIdを使用）
    if (!companyId) {
      console.error("[API] Unauthorized: No company ID in session");
      const res = NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const body = await req.json();
    const { results } = body;

    console.log("[API] update-send-result processing:", {
      resultsCount: results?.length,
      companyId, // セッションから取得した信頼できるcompanyId
      results: results,
    });

    if (!results || !Array.isArray(results) || results.length === 0) {
      console.error("[API] Invalid request: results array is required");
      const res = NextResponse.json(
        { success: false, error: "results array is required" },
        { status: 400 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const updateResults: Array<{
      leadId: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const result of results) {
      const { leadId, status, error, sentAt } = result;

      if (!leadId || !status) {
        updateResults.push({
          leadId: leadId || "unknown",
          success: false,
          error: "leadId and status are required",
        });
        continue;
      }

      // バリデーション: statusの値をチェック
      const validStatuses = ["success", "failed", "blocked", "pending"];
      if (!validStatuses.includes(status)) {
        updateResults.push({
          leadId,
          success: false,
          error: `Invalid status: ${status}`,
        });
        continue;
      }

      // 現在のリードを取得（company_idも取得して検証）
      const { data: currentLead, error: fetchError } = await supabaseAdmin
        .from("lead_lists")
        .select("submit_count, company_id")
        .eq("id", leadId)
        .single();

      if (fetchError) {
        updateResults.push({
          leadId,
          success: false,
          error: `Lead not found: ${fetchError.message}`,
        });
        continue;
      }

      // leadIdとcompanyIdの整合性を確認
      if (currentLead.company_id !== companyId) {
        console.error(
          "[API] Authorization failed: leadId does not belong to companyId",
          {
            leadId,
            leadCompanyId: currentLead.company_id,
            requestCompanyId: companyId,
          },
        );
        updateResults.push({
          leadId,
          success: false,
          error: "Unauthorized: Lead does not belong to your company",
        });
        continue;
      }

      // 更新データを準備
      const updateData: Record<string, unknown> = {
        send_status: status,
        submit_count: (currentLead?.submit_count || 0) + 1,
        last_submitted_at: sentAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // エラーメッセージがある場合は保存
      if (error) {
        updateData.error_message = error;
      } else if (status === "success") {
        // 成功時はエラーメッセージをクリア
        updateData.error_message = null;
      }

      // DBを更新
      const { error: updateError } = await supabaseAdmin
        .from("lead_lists")
        .update(updateData)
        .eq("id", leadId);

      if (updateError) {
        updateResults.push({
          leadId,
          success: false,
          error: `Update failed: ${updateError.message}`,
        });
      } else {
        updateResults.push({
          leadId,
          success: true,
        });
      }
    }

    const successCount = updateResults.filter((r) => r.success).length;
    const failedCount = updateResults.filter((r) => !r.success).length;

    console.log("[API] update-send-result completed:", {
      successCount,
      failedCount,
      results: updateResults,
    });

    const response = NextResponse.json({
      success: true,
      message: `Updated ${successCount} leads, ${failedCount} failed`,
      results: updateResults,
    });

    // Cookieの変更を適用
    applyAuthCookies(response, cookieMutations);

    // CORS設定（特定のオリジンのみ許可）
    const origin = req.headers.get("origin");
    const allowedOrigins = ["http://localhost:3000", "https://apotto.jp"];

    // Vercelプレビュー環境を許可（*.vercel.app）
    if (
      origin &&
      (allowedOrigins.includes(origin) ||
        origin.match(/^https:\/\/.*\.vercel\.app$/))
    ) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type");
      response.headers.set("Access-Control-Allow-Credentials", "true");
    }

    return response;
  } catch (error) {
    console.error("[API] update-send-result error:", error);
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );

    // Cookieの変更を適用
    applyAuthCookies(response, cookieMutations);

    // CORS設定（エラー時も特定のオリジンのみ許可）
    const origin = req.headers.get("origin");
    const allowedOrigins = ["http://localhost:3000", "https://apotto.jp"];

    if (
      origin &&
      (allowedOrigins.includes(origin) ||
        origin.match(/^https:\/\/.*\.vercel\.app$/))
    ) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type");
      response.headers.set("Access-Control-Allow-Credentials", "true");
    }

    return response;
  }
}

// OPTIONSリクエストのハンドラー（プリフライト対応）
export async function OPTIONS(req: NextRequest) {
  const response = new NextResponse(null, { status: 204 });

  // CORS設定（特定のオリジンのみ許可）
  const origin = req.headers.get("origin");
  const allowedOrigins = ["http://localhost:3000", "https://apotto.jp"];

  if (
    origin &&
    (allowedOrigins.includes(origin) ||
      origin.match(/^https:\/\/.*\.vercel\.app$/))
  ) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return response;
}
