import { NextRequest, NextResponse } from "next/server";
import {
  getAccountContextFromRequest,
  applyAuthCookies,
  createSessionInvalidResponse,
} from "@/lib/routeAuth";
import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import { ErrorMessages, createErrorResponse, logError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET: ジョブステータス取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  // Next.js 15+: params は Promise なので await で展開
  const { jobId } = await params;

  const { companyId, cookieMutations, sessionValid, account } =
    await getAccountContextFromRequest(request);

  // セッション無効チェック
  if (!sessionValid) {
    console.error("[GET /api/batch-jobs/[jobId]] Session invalid", {
      email: account?.email,
      companyId,
      jobId,
    });
    return createSessionInvalidResponse(cookieMutations);
  }

  if (!companyId) {
    console.error(
      "[GET /api/batch-jobs/[jobId]] Unauthorized - No company ID",
      {
        jobId,
      },
    );
    const res = NextResponse.json(
      createErrorResponse(ErrorMessages.AUTH.UNAUTHORIZED),
      { status: 401 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  const supabase = createSupabaseServiceClient();

  // ジョブ取得（会社IDでフィルタリング）
  const { data: job, error } = await supabase
    .from("batch_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .single();

  if (error || !job) {
    logError("GET /api/batch-jobs/[jobId] - Job Fetch Error", error, {
      companyId,
      jobId,
    });
    const res = NextResponse.json({ error: "Job not found" }, { status: 404 });
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  const res = NextResponse.json(job);
  applyAuthCookies(res, cookieMutations);
  return res;
}
