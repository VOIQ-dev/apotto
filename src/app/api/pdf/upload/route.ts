import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import {
  applyAuthCookies,
  getAccountContextFromRequest,
} from "@/lib/routeAuth";

const bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "pdf-assets";

console.log("[pdf/upload] Bucket name configured:", bucketName);

export async function POST(request: NextRequest) {
  try {
    const { user, companyId, cookieMutations } =
      await getAccountContextFromRequest(request);

    console.log("[pdf/upload] Request received:", {
      userId: user?.id,
      companyId,
    });

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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return json({ error: "ファイルが指定されていません" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return json(
        { error: "PDFファイルのみアップロード可能です" },
        { status: 400 },
      );
    }

    // 50MB 制限
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return json(
        { error: "ファイルサイズは50MB以下にしてください" },
        { status: 400 },
      );
    }

    console.log("[pdf/upload] Environment check:", {
      supabaseUrl:
        process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + "...",
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      bucketName,
    });

    const supabase = createSupabaseServiceClient();

    // ユニークトークン生成
    const token = crypto.randomUUID();
    const storagePath = `${companyId}/${token}.pdf`;

    console.log("[pdf/upload] Starting upload:", {
      bucketName,
      storagePath,
      fileSize: file.size,
      fileName: file.name,
      companyId,
    });

    // Storage にアップロード
    const arrayBuffer = await file.arrayBuffer();
    console.log(
      "[pdf/upload] ArrayBuffer created, size:",
      arrayBuffer.byteLength,
    );

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, arrayBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    console.log("[pdf/upload] Upload result:", {
      success: !uploadError,
      data: uploadData,
      error: uploadError,
    });

    if (uploadError) {
      console.error("[pdf/upload] Storage upload error:", uploadError);
      return json(
        { error: "ストレージへのアップロードに失敗しました" },
        { status: 500 },
      );
    }

    console.log("[pdf/upload] Storage upload successful");

    // DB に PDF メタ情報を保存（pdfs テーブル）
    console.log("[pdf/upload] Inserting to DB:", {
      original_filename: file.name,
      storage_path: storagePath,
      size_bytes: file.size,
      company_id: companyId,
    });

    const { data: inserted, error: dbError } = await supabase
      .from("pdfs")
      .insert({
        original_filename: file.name,
        storage_path: storagePath,
        size_bytes: file.size,
        company_id: companyId,
        is_deleted: false,
      })
      .select("id, storage_path")
      .single();

    if (dbError) {
      console.error("[pdf/upload] DB insert error:", dbError);
      // ロールバック: アップロードしたファイルを削除
      console.log(
        "[pdf/upload] Rolling back: removing uploaded file from storage",
      );
      const { error: removeError } = await supabase.storage
        .from(bucketName)
        .remove([storagePath]);
      if (removeError) {
        console.error("[pdf/upload] Rollback failed:", removeError);
      }
      return json(
        { error: "データベースへの保存に失敗しました" },
        { status: 500 },
      );
    }

    console.log("[pdf/upload] DB insert successful:", inserted);

    console.log("[pdf/upload] Creating signed URL for:", storagePath);
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from(bucketName)
        .createSignedUrl(storagePath, 3600);

    if (signedUrlError) {
      console.error("[pdf/upload] Signed URL error:", signedUrlError);
    } else {
      console.log("[pdf/upload] Signed URL created successfully");
    }

    console.log("[pdf/upload] Upload complete, returning response");
    return json({
      success: true,
      id: inserted?.id ?? null,
      storagePath,
      signedUrl: signedUrlData?.signedUrl ?? null,
      filename: file.name,
      size: file.size,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
