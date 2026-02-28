"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";

/** API /api/account/me のレスポンス型 */
interface AccountMeResponse {
  success?: boolean;
  account?: {
    name?: string | null;
    email?: string | null;
  };
  company?: {
    name?: string | null;
  };
}

export interface UserInfo {
  userName: string;
  userEmail: string;
  companyName: string;
}

interface UserContextValue extends UserInfo {
  /** データ取得中かどうか */
  isLoading: boolean;
  /** 最新のユーザー情報を再取得する */
  refresh: () => Promise<void>;
  /** メール更新後にローカルのみ即時反映する */
  setUserEmail: (email: string) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: PropsWithChildren) {
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmailState] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  /** 初回取得完了済みかどうか（ref で管理し fetchUser の再生成を防ぐ） */
  const hasFetchedRef = useRef(false);

  const fetchUser = useCallback(async () => {
    // 初回のみローディング表示
    if (!hasFetchedRef.current) setIsLoading(true);
    try {
      const res = await fetch("/api/account/me", { credentials: "include" });
      if (!res.ok) return;
      const data: AccountMeResponse = await res.json().catch(() => ({}));
      setUserName((data.account?.name ?? "").trim());
      setUserEmailState((data.account?.email ?? "").trim());
      setCompanyName((data.company?.name ?? "").trim());
    } catch {
      // fail silently
    } finally {
      setIsLoading(false);
      hasFetchedRef.current = true;
    }
  }, []);

  // アプリ起動時に 1 回だけ取得
  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const setUserEmail = useCallback((email: string) => {
    setUserEmailState(email);
  }, []);

  const value = useMemo<UserContextValue>(
    () => ({
      userName,
      userEmail,
      companyName,
      isLoading,
      refresh: fetchUser,
      setUserEmail,
    }),
    [userName, userEmail, companyName, isLoading, fetchUser, setUserEmail],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

/**
 * ユーザー情報を取得する Hook
 *
 * UserProvider の配下でのみ使用可能。
 * Provider 外で呼ばれた場合は例外を投げる。
 */
export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return ctx;
}
