import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import { LoginSchema, formatZodErrors } from "@/lib/schemas";
import {
  checkRateLimit,
  RateLimitPresets,
  addRateLimitHeaders,
} from "@/lib/rateLimit";
import { ErrorMessages, createErrorResponse, logError } from "@/lib/errors";

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
    throw new Error(
      "Supabase の公開環境変数 (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) が設定されていません。",
    );
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
    // レート制限チェック（ログイン試行回数を制限）
    const rateLimitResult = checkRateLimit(request, RateLimitPresets.login);

    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        createErrorResponse(ErrorMessages.RATE_LIMIT.TOO_MANY_LOGIN_ATTEMPTS, {
          retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
        }),
        { status: 429 },
      );
      addRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const rawBody = await request.json().catch(() => ({}));

    // Zodバリデーション
    const validation = LoginSchema.safeParse(rawBody);

    if (!validation.success) {
      const { message, fields } = formatZodErrors(validation.error);
      const response = NextResponse.json(
        { error: message, errors: fields },
        { status: 400 },
      );
      addRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const { email: rawEmail, password } = validation.data;
    const email = rawEmail.trim().toLowerCase();

    const { supabase, cookieMutations } = createAuthClientForRequest(request);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      const raw = String(error?.message ?? "");
      const isEmailNotConfirmed = /email not confirmed/i.test(raw);
      const msg = isEmailNotConfirmed
        ? ErrorMessages.AUTH.EMAIL_NOT_CONFIRMED
        : ErrorMessages.AUTH.INVALID_CREDENTIALS;
      const res = NextResponse.json(createErrorResponse(msg), {
        status: isEmailNotConfirmed ? 403 : 401,
      });
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    // DB側のアカウントを確認（会社スコープ等に必要）
    const service = createSupabaseServiceClient();
    const { data: account, error: accountErr } = await service
      .from("accounts")
      .select("id, status, activated_at")
      .eq("email", email)
      .maybeSingle();
    if (accountErr) {
      logError("auth/login", accountErr, { context: "accounts lookup failed" });
    }
    const accountId = String(
      (account as { id?: unknown } | null)?.id ?? "",
    ).trim();
    if (!accountId) {
      await supabase.auth.signOut().catch(() => null);
      const res = NextResponse.json(
        createErrorResponse(ErrorMessages.AUTH.ACCOUNT_NOT_FOUND),
        { status: 403 },
      );
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    // ログイン可視化のために最終ログイン日時を更新（=制御ではなく観測）
    const nowIso = new Date().toISOString();
    const status = String(
      (account as { status?: unknown } | null)?.status ?? "",
    ).trim();
    const activatedAt = String(
      (account as { activated_at?: unknown } | null)?.activated_at ?? "",
    ).trim();
    const patch: Record<string, unknown> = {
      last_login_at: nowIso,
      updated_at: nowIso,
    };
    // 未ログイン状態(invited 等)はログイン済(active)へ更新
    if (status !== "active") patch.status = "active";
    if (!activatedAt) patch.activated_at = nowIso;
    const { error: updateErr } = await service
      .from("accounts")
      .update(patch)
      .eq("id", accountId);
    if (updateErr) {
      logError("auth/login", updateErr, { context: "accounts update failed" });
    }

    const res = NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        metadata: data.user.user_metadata ?? {},
      },
    });
    applyAuthCookies(res, cookieMutations);
    addRateLimitHeaders(res.headers, rateLimitResult);
    return res;
  } catch (err) {
    logError("auth/login", err);
    return NextResponse.json(
      createErrorResponse(ErrorMessages.SERVER.INTERNAL_ERROR),
      { status: 500 },
    );
  }
}
