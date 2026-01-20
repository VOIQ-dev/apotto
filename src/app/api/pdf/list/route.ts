import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import {
  applyAuthCookies,
  getAccountContextFromRequest,
} from "@/lib/routeAuth";
const bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "pdf-assets";
export async function GET(request: NextRequest) {
  let companyId: string | null = null;
  let account: any = null;
  try {
    const {
      user,
      companyId: cId,
      cookieMutations,
      account: acc,
    } = await getAccountContextFromRequest(request);
    companyId = cId;
    account = acc;
    if (!user) {
      console.error("[GET /api/pdf/list] Unauthorized - No user", {
        hasAccount: !!account,
      });
      const res = NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }
    if (!companyId) {
      console.error("[GET /api/pdf/list] Forbidden - No company ID", {
        email: account?.email,
        userId: user?.id,
        hasAccount: !!account,
      });
      const res = NextResponse.json(
        { error: "会社情報が紐づいていません" },
        { status: 403 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const supabase = createSupabaseServiceClient();

    const { data: pdfs, error } = await supabase
      .from("pdfs")
      .select(
        "id, original_filename, storage_path, size_bytes, created_at, is_deleted",
      )
      .eq("company_id", companyId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/pdf/list] DB Fetch Error", {
        companyId,
        email: account?.email,
        accountId: account?.id,
        error,
      });
      const res = NextResponse.json(
        { error: "PDF一覧の取得に失敗しました" },
        { status: 500 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    if (!pdfs || pdfs.length === 0) {
      const res = NextResponse.json({ pdfs: [] });
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const paths = pdfs
      .map((p) => String(p.storage_path ?? "").trim())
      .filter((p) => p.length > 0);

    if (paths.length === 0) {
      const res = NextResponse.json({ pdfs: [] });
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrls(paths, 3600);

    if (signedError) {
      console.error("[GET /api/pdf/list] Signed URL Generation Error", {
        companyId,
        email: account?.email,
        accountId: account?.id,
        bucketName,
        pathsCount: paths.length,
        error: signedError,
      });
      const res = NextResponse.json(
        { error: "PDF一覧の取得に失敗しました" },
        { status: 500 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const signedMap = new Map<string, string>();
    signed?.forEach((item) => {
      if (item?.path && item?.signedUrl)
        signedMap.set(item.path, item.signedUrl);
    });

    const result = (pdfs ?? []).map((p) => ({
      id: p.id,
      filename: p.original_filename,
      size_bytes: p.size_bytes,
      created_at: p.created_at,
      storage_path: p.storage_path,
      signed_url: signedMap.get(p.storage_path) ?? null,
    }));

    const res = NextResponse.json({ pdfs: result });
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (err) {
    console.error("[GET /api/pdf/list] Unexpected Error", {
      companyId,
      email: account?.email,
      accountId: account?.id,
      error: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
