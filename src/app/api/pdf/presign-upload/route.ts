import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import {
  applyAuthCookies,
  getAccountContextFromRequest,
} from "@/lib/routeAuth";

const bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "pdf-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 15 * 1024 * 1024; // 15MB

export async function POST(request: NextRequest) {
  try {
    const { user, companyId, cookieMutations } =
      await getAccountContextFromRequest(request);

    const json = (body: unknown, init?: { status?: number }) => {
      const res = NextResponse.json(body, { status: init?.status });
      applyAuthCookies(res, cookieMutations);
      return res;
    };

    if (!user) {
      return json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!companyId) {
      return json({ error: "会社情報が紐づいていません" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      filename?: string;
      size?: number;
      contentType?: string;
    };

    const filename = body.filename?.trim();
    const size = body.size ?? 0;
    const contentType = body.contentType ?? "application/pdf";

    if (!filename) {
      return json({ error: "ファイル名が指定されていません" }, { status: 400 });
    }

    if (contentType !== "application/pdf") {
      return json(
        { error: "PDFファイルのみアップロード可能です" },
        { status: 400 },
      );
    }

    if (size > MAX_SIZE) {
      return json(
        { error: "ファイルサイズは50MB以下にしてください" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServiceClient();

    const { data: existing } = await supabase
      .from("pdfs")
      .select("id")
      .eq("company_id", companyId)
      .eq("original_filename", filename)
      .eq("is_deleted", false)
      .maybeSingle();

    if (existing) {
      return json(
        { error: `「${filename}」は既に登録されています。` },
        { status: 409 },
      );
    }

    const token = crypto.randomUUID();
    const storagePath = `${companyId}/${token}.pdf`;

    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUploadUrl(storagePath);

    if (signedError || !signedData) {
      console.error("[pdf/presign-upload] signed URL error:", signedError);
      return json(
        { error: "アップロードURLの生成に失敗しました" },
        { status: 500 },
      );
    }

    return json({
      signedUrl: signedData.signedUrl,
      uploadToken: signedData.token,
      storagePath,
      filename,
    });
  } catch (err) {
    console.error("[pdf/presign-upload] Unexpected error:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
