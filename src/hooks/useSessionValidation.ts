"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * セッション無効時の自動ログアウト処理
 * 別の場所でログインされた場合にログインページへリダイレクト
 */
export function useSessionValidation() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const handleSessionInvalid = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ログアウト失敗しても続行
    }
    routerRef.current.replace("/login?reason=session_invalid");
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

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
