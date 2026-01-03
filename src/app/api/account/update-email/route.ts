import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CookieMutation = {
  name: string;
  value: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any;
};

function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase の公開環境変数が設定されていません。");
  }
  return { url, anonKey };
}

function createAuthClientForRequest(request: NextRequest) {
  const { url, anonKey } = getPublicSupabaseEnv();
  const cookieMutations: CookieMutation[] = [];
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name) {
        return request.cookies.get(name)?.value;
      },
      set(name, value, options) {
        cookieMutations.push({ name, value, options });
      },
      remove(name, options) {
        cookieMutations.push({
          name,
          value: "",
          options: { ...options, maxAge: 0 },
        });
      },
    },
  });
  return { supabase, cookieMutations };
}

function applyAuthCookies(
  response: NextResponse,
  cookieMutations: CookieMutation[],
) {
  for (const c of cookieMutations) {
    response.cookies.set(c.name, c.value, c.options);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, cookieMutations } = createAuthClientForRequest(request);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      const res = NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const body = await request.json().catch(() => ({}));
    const newEmail = body.email as string | undefined;

    if (!newEmail || typeof newEmail !== "string") {
      const res = NextResponse.json(
        { error: "メールアドレスを指定してください" },
        { status: 400 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    // メールアドレスの形式を簡易的にチェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      const res = NextResponse.json(
        { error: "有効なメールアドレスを入力してください" },
        { status: 400 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    // Supabase Authでメールアドレスを更新
    const { error: updateError } = await supabase.auth.updateUser({
      email: newEmail,
    });

    if (updateError) {
      console.error("[update-email] Supabase updateUser failed", updateError);
      const res = NextResponse.json(
        { error: "メールアドレスの更新に失敗しました" },
        { status: 500 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    // accountsテーブルも更新
    const service = createSupabaseServiceClient();
    const currentEmail = data.user.email;

    if (currentEmail) {
      const { error: accountUpdateError } = await service
        .from("accounts")
        .update({ email: newEmail })
        .eq("email", currentEmail);

      if (accountUpdateError) {
        console.error(
          "[update-email] accounts table update failed",
          accountUpdateError,
        );
      }
    }

    const res = NextResponse.json({
      success: true,
      message:
        "確認メールを送信しました。メールを確認して変更を完了してください。",
    });
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (err) {
    console.error("[update-email] Unexpected error", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
