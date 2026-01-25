import { NextRequest, NextResponse } from "next/server";
import {
  getAccountContextFromRequest,
  applyAuthCookies,
  createSessionInvalidResponse,
} from "@/lib/routeAuth";
import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import { ErrorMessages, createErrorResponse, logError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 10; // ジョブ登録のみなので10秒で十分
export const runtime = "nodejs";

// Railway のワーカーURL（環境変数で設定）
const WORKER_URL = process.env.AUTO_SUBMIT_WORKER_URL;

type BatchItem = {
  url: string;
  company?: string;
  department?: string;
  title?: string;
  person?: string;
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  message?: string;
};

type BatchRequest = {
  items: BatchItem[];
  leadIds: string[]; // 対象リードのID配列
  debug?: boolean;
};

// CORSプリフライト対応
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(req: NextRequest) {
  const { companyId, cookieMutations, sessionValid, account } =
    await getAccountContextFromRequest(req);

  // セッション無効チェック
  if (!sessionValid) {
    console.error("[POST /api/auto-submit/batch] Session invalid", {
      email: account?.email,
      companyId,
    });
    return createSessionInvalidResponse(cookieMutations);
  }

  if (!companyId) {
    console.error("[POST /api/auto-submit/batch] Unauthorized - No company ID");
    const res = NextResponse.json(
      createErrorResponse(ErrorMessages.AUTH.UNAUTHORIZED),
      { status: 401 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  const body = await req.json().catch(() => ({}));
  const { items, leadIds, debug } = body as BatchRequest;

  if (!items || !Array.isArray(items) || items.length === 0) {
    const res = NextResponse.json(
      { error: "items array is required" },
      { status: 400 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
    const res = NextResponse.json(
      { error: "leadIds array is required" },
      { status: 400 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  // ワーカーURLが設定されていない場合はエラー
  if (!WORKER_URL) {
    console.error(
      "[POST /api/auto-submit/batch] AUTO_SUBMIT_WORKER_URL is not configured",
    );
    const res = NextResponse.json(
      { error: "Worker URL not configured" },
      { status: 500 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  try {
    const supabase = createSupabaseServiceClient();

    // DBにバッチジョブを登録
    const { data: job, error: insertError } = await supabase
      .from("batch_jobs")
      .insert({
        company_id: companyId,
        status: "pending",
        total_items: items.length,
        completed_items: 0,
        failed_items: 0,
        lead_ids: leadIds,
      })
      .select()
      .single();

    if (insertError || !job) {
      logError("POST /api/auto-submit/batch - Job Insert Error", insertError, {
        companyId,
        itemCount: items.length,
      });
      const res = NextResponse.json(
        createErrorResponse(ErrorMessages.SERVER.DATABASE_ERROR),
        { status: 500 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    console.log(
      `[POST /api/auto-submit/batch] Job created: ${job.id} for company ${companyId} with ${items.length} items`,
    );

    // Railway に非同期処理を依頼（待たない）
    console.log(
      `[POST /api/auto-submit/batch] Sending async job to Railway: ${WORKER_URL}/auto-submit/batch-async`,
    );
    fetch(`${WORKER_URL}/auto-submit/batch-async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jobId: job.id,
        companyId,
        items,
        leadIds,
        debug,
      }),
    })
      .then((response) => {
        console.log(
          `[POST /api/auto-submit/batch] Railway responded with status: ${response.status}`,
        );
      })
      .catch((err) => {
        console.error(
          `[POST /api/auto-submit/batch] Failed to start async job: ${err.message}`,
        );
        // エラーでもジョブは登録済みなので、Railway側で後から処理可能
      });

    // 即座にレスポンス（ジョブIDを返す）
    const res = NextResponse.json({
      jobId: job.id,
      status: "pending",
      message: "Batch job started",
    });
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    logError("POST /api/auto-submit/batch - Error", error, { companyId });
    const res = NextResponse.json({ error: msg }, { status: 500 });
    applyAuthCookies(res, cookieMutations);
    return res;
  }
}
