"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * セッション無効時の自動ログアウト処理
 * 別の場所でログインされた場合にログインページへリダイレクト
 */
export function useSessionValidation() {
  const router = useRouter();

  const handleSessionInvalid = useCallback(async () => {
    // ログアウトAPIを呼び出してCookieをクリア
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ログアウト失敗しても続行
    }
    // ログインページへリダイレクト
    router.replace("/login?reason=session_invalid");
  }, [router]);

  // グローバルなfetchインターセプター
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      // 401エラーでセッション無効の場合
      if (response.status === 401) {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();
          if (
            data.code === "SESSION_INVALID" ||
            data.message?.includes("別の場所でログイン")
          ) {
            handleSessionInvalid();
          }
        } catch {
          // JSONパースエラーは無視
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [handleSessionInvalid]);

  return { handleSessionInvalid };
}
