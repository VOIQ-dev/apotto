import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { requireBackofficeAuth } from "@/lib/backofficeAuth";
import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import { findAuthUserIdByEmail } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

type RequestBody = {
  password?: string;
};

function generatePassword(): string {
  return randomBytes(16).toString("base64url");
}

export async function POST(request: NextRequest, context: RouteContext) {
  const denied = await requireBackofficeAuth(request);
  if (denied) return denied;

  try {
    const { accountId } = await context.params;
    const id = String(accountId ?? "").trim();
    if (!id) {
      return NextResponse.json(
        { error: "accountId が不正です" },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const requested = String(body.password ?? "").trim();
    const password = requested || generatePassword();

    if (password.length < 8) {
      return NextResponse.json(
        { error: "password は8文字以上にしてください" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServiceClient();

    const { data: account, error: accountErr } = await supabase
      .from("accounts")
      .select("id, company_id, email, role")
      .eq("id", id)
      .maybeSingle();

    if (accountErr) {
      console.error(
        "[backoffice/accounts/password] accounts lookup failed",
        accountErr,
      );
      return NextResponse.json(
        { error: "再発行に失敗しました" },
        { status: 500 },
      );
    }
    if (!account) {
      return NextResponse.json(
        { error: "アカウントが見つかりません" },
        { status: 404 },
      );
    }

    const email = String((account as { email?: unknown }).email ?? "")
      .trim()
      .toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: "アカウント情報が不正です" },
        { status: 400 },
      );
    }

    // Authユーザーを探してパスワードを更新（取得できないので再設定のみ）
    const userId = await findAuthUserIdByEmail(supabase, email);
    if (!userId) {
      return NextResponse.json(
        { error: "Authユーザーが見つかりません（メール一致）" },
        { status: 404 },
      );
    }

    const { data: userData, error: userErr } =
      await supabase.auth.admin.getUserById(userId);
    if (userErr) {
      console.error(
        "[backoffice/accounts/password] getUserById failed",
        userErr,
      );
      return NextResponse.json(
        { error: "再発行に失敗しました" },
        { status: 500 },
      );
    }

    const prevMeta = (userData.user?.user_metadata ?? {}) as Record<
      string,
      unknown
    >;
    const companyId = String(
      (account as { company_id?: unknown }).company_id ?? "",
    );
    const role = String((account as { role?: unknown }).role ?? "");

    // NOTE:
    // - Supabaseの設定によっては「Email not confirmed」でログインできない場合があるため、
    //   再発行時に email_confirm を true に寄せる（型が無い場合があるので any で安全に指定）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (
      supabase.auth.admin.updateUserById as any
    )(userId, {
      password,
      email_confirm: true,
      user_metadata: {
        ...prevMeta,
        company_id: companyId || prevMeta.company_id,
        role: role || prevMeta.role,
        must_change_password: true,
      },
    });

    if (updateErr) {
      console.error(
        "[backoffice/accounts/password] updateUserById failed",
        updateErr,
      );
      return NextResponse.json(
        { error: "再発行に失敗しました" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      initialPassword: password,
      note: "次回ログイン時にパスワード変更を促します。",
    });
  } catch (err) {
    console.error("[backoffice/accounts/password] Unexpected error", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
