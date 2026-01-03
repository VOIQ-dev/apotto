import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

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
    const currentPassword = body.currentPassword as string | undefined;
    const newPassword = body.newPassword as string | undefined;

    if (!currentPassword || !newPassword) {
      const res = NextResponse.json(
        { error: "現在のパスワードと新しいパスワードを入力してください" },
        { status: 400 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    if (newPassword.length < 8) {
      const res = NextResponse.json(
        { error: "新しいパスワードは8文字以上で設定してください" },
        { status: 400 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const email = data.user.email;
    if (!email) {
      const res = NextResponse.json(
        { error: "ユーザー情報が不正です" },
        { status: 400 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    // 現在のパスワードで認証を試みる（これにより現在のパスワードが正しいか検証）
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInError) {
      console.error(
        "[update-password] Current password verification failed",
        signInError,
      );
      const res = NextResponse.json(
        { error: "現在のパスワードが正しくありません" },
        { status: 401 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    // パスワードを更新
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      console.error("[update-password] Password update failed", updateError);
      const res = NextResponse.json(
        { error: "パスワードの更新に失敗しました" },
        { status: 500 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    const res = NextResponse.json({
      success: true,
      message: "パスワードを更新しました",
    });
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (err) {
    console.error("[update-password] Unexpected error", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
