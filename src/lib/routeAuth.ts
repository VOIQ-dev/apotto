import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "./supabaseServer";
import { SESSION_COOKIE_NAME } from "./sessionConfig";
import { ErrorMessages, createErrorResponse } from "./errors";

export type CookieMutation = {
  name: string;
  value: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any;
};

type AccountRow = {
  id: string;
  company_id: string;
  email: string;
  role: string;
  status: string;
  current_session_id: string | null;
};

function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase の公開環境変数 (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) が設定されていません。",
    );
  }
  return { url, anonKey };
}

export function applyAuthCookies(
  response: NextResponse,
  cookieMutations: CookieMutation[],
) {
  for (const c of cookieMutations) {
    response.cookies.set(c.name, c.value, c.options);
  }
}

export async function getAuthUserFromRequest(
  request: NextRequest,
): Promise<{ user: User | null; cookieMutations: CookieMutation[] }> {
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

  const { data } = await supabase.auth.getUser();
  return { user: data.user ?? null, cookieMutations };
}

export async function getAccountContextFromRequest(
  request: NextRequest,
): Promise<{
  user: User | null;
  cookieMutations: CookieMutation[];
  account: AccountRow | null;
  companyId: string | null;
  role: "admin" | "member" | null;
  sessionValid: boolean;
}> {
  const { user, cookieMutations } = await getAuthUserFromRequest(request);
  const email = user?.email ?? null;
  if (!email) {
    return {
      user,
      cookieMutations,
      account: null,
      companyId: null,
      role: null,
      sessionValid: false,
    };
  }

  const supabase = createSupabaseServiceClient();
  const { data: account, error } = await supabase
    .from("accounts")
    .select("id, company_id, email, role, status, current_session_id")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[routeAuth] accounts lookup failed", error);
  }

  const role =
    account?.role === "admin"
      ? "admin"
      : account?.role === "member"
        ? "member"
        : null;
  const companyId = account?.company_id ? String(account.company_id) : null;

  // セッションID検証（同時ログイン制限）
  // 環境変数でセッション検証を無効化できるようにする
  const sessionCheckEnabled = process.env.ENABLE_SESSION_CHECK !== "false";

  const cookieSessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const dbSessionId = account?.current_session_id;

  // DBにセッションIDがない場合（マイグレーション前）は検証をスキップ
  // または環境変数でセッション検証が無効化されている場合もスキップ
  const sessionValid =
    !sessionCheckEnabled || !dbSessionId || cookieSessionId === dbSessionId;

  // デバッグログ
  if (sessionCheckEnabled && dbSessionId && cookieSessionId !== dbSessionId) {
    console.log("[routeAuth] Session mismatch detected:", {
      email,
      cookieSessionId: cookieSessionId?.slice(0, 8) + "...",
      dbSessionId: dbSessionId?.slice(0, 8) + "...",
    });
  }

  return {
    user,
    cookieMutations,
    account: (account as unknown as AccountRow) ?? null,
    companyId,
    role,
    sessionValid,
  };
}

/**
 * セッション無効時に401レスポンスを返す
 */
export function createSessionInvalidResponse(
  cookieMutations: CookieMutation[],
): NextResponse {
  const res = NextResponse.json(
    {
      ...createErrorResponse(ErrorMessages.AUTH.SESSION_INVALID),
      code: "SESSION_INVALID",
    },
    { status: 401 },
  );
  applyAuthCookies(res, cookieMutations);
  return res;
}

/**
 * 認証されたユーザーの会社IDを簡易取得
 * Route Handlerで使用する簡易版（requestオブジェクトが必要）
 *
 * @deprecated 新しいコードではgetAccountContextFromRequestを使用してください
 */
export async function getAuthenticatedCompanyId(
  request?: NextRequest,
): Promise<string | null> {
  // requestが渡されない場合はheaders()を使用（Server Componentから呼ばれた場合）
  if (!request) {
    try {
      const { headers } = await import("next/headers");
      const headersList = await headers();

      // NextRequestを模倣するオブジェクトを作成
      const mockRequest = {
        cookies: {
          get(name: string) {
            const cookieHeader = headersList.get("cookie");
            if (!cookieHeader) return undefined;

            const cookie = cookieHeader
              .split(";")
              .map((c) => c.trim())
              .find((c) => c.startsWith(`${name}=`));

            if (!cookie) return undefined;

            return { value: cookie.split("=")[1] };
          },
        },
        headers: headersList,
      } as unknown as NextRequest;

      const { companyId, sessionValid } =
        await getAccountContextFromRequest(mockRequest);
      return sessionValid && companyId ? companyId : null;
    } catch {
      return null;
    }
  }

  // requestが渡された場合（Route Handlerから呼ばれた場合）
  const { companyId, sessionValid } =
    await getAccountContextFromRequest(request);
  return sessionValid && companyId ? companyId : null;
}
