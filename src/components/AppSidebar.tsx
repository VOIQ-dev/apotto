"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Tooltip } from "@mantine/core";
import { UserProfileModal } from "./UserProfileModal";
import { AiProgressBanner } from "./AiProgressBanner";
import { useSessionValidation } from "@/hooks/useSessionValidation";
import { useUser } from "@/contexts/UserContext";

const BUSY_KEY = "ai-custom:busy";
const BUSY_POLL_MS = 1000;

export function AppSidebar() {
  const { userName, userEmail, companyName, setUserEmail } = useUser();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [busyState, setBusyState] = useState<string>("");
  const pathname = usePathname();

  // セッション検証（同時ログイン制限）
  useSessionValidation();

  // ai-custom の処理中状態を監視（ページ遷移ブロック用）
  useEffect(() => {
    const read = () => {
      try {
        setBusyState(localStorage.getItem(BUSY_KEY) ?? "");
      } catch {
        setBusyState("");
      }
    };
    read();
    const timer = setInterval(read, BUSY_POLL_MS);
    const onStorage = (e: StorageEvent) => {
      if (e.key === BUSY_KEY) read();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const isBusy = busyState !== "";
  const busyTitle = isBusy
    ? busyState === "generating"
      ? "AI文面生成中はページ遷移できません"
      : busyState === "sending"
        ? "フォーム送信中はページ遷移できません"
        : "AI生成・送信中はページ遷移できません"
    : undefined;

  // 処理中は ai-custom 以外へのリンクを非活性化（クリック無効）
  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    target: string,
  ) => {
    if (!isBusy) return;
    if (target === "/ai-custom") return;
    e.preventDefault();
    e.stopPropagation();
  };

  const navItems = [
    {
      label: "AI生成・送信",
      path: "/ai-custom",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      ),
    },
    {
      label: "PDF管理",
      path: "/pdf-assets",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
    {
      label: "データ分析",
      path: "/dashboard",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
    },
    {
      label: "お知らせ",
      path: "/announcements",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
      ),
    },
    {
      label: "フィードバック",
      path: "/feedback",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      ),
    },
  ];

  const handleUpdateEmail = async (newEmail: string) => {
    const res = await fetch("/api/account/update-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: newEmail }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "メールアドレスの更新に失敗しました");
    }

    setUserEmail(newEmail);
  };

  const handleUpdatePassword = async (
    currentPassword: string,
    newPassword: string,
  ) => {
    const res = await fetch("/api/account/update-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "パスワードの更新に失敗しました");
    }
  };

  const handleLogout = async () => {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error("ログアウトに失敗しました");
    }

    // ログアウト成功後、ログインページへリダイレクト
    window.location.href = "/login";
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border/50 bg-background/95 backdrop-blur-xl transition-transform hidden md:block">
      <div className="flex h-20 items-center border-b border-border/50 px-6">
        <Link href="/" className="flex items-center gap-1">
          <span className="text-2xl font-extrabold tracking-tight leading-none text-emerald-400">
            apotto
          </span>
          <Image
            src="/apotto/apotto_logo.png"
            alt="apotto"
            width={120}
            height={64}
            className="h-16 w-auto"
            loading="eager"
            style={{ height: "auto" }}
          />
        </Link>
      </div>

      <div className="py-6 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              aria-current={isActive ? "page" : undefined}
              onClick={(e) => handleNavClick(e, item.path)}
              aria-disabled={isBusy && item.path !== "/ai-custom"}
              tabIndex={isBusy && item.path !== "/ai-custom" ? -1 : 0}
              title={item.path !== "/ai-custom" ? busyTitle : undefined}
              className={`relative group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "text-foreground shadow-[0_10px_40px_rgba(16,185,129,0.18)] ring-1 ring-emerald-400/30 bg-gradient-to-r from-emerald-500/15 via-emerald-400/10 to-transparent"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              } ${
                isBusy && item.path !== "/ai-custom"
                  ? "pointer-events-none opacity-40 cursor-not-allowed grayscale"
                  : ""
              }`}
            >
              {isActive && (
                <>
                  <div className="absolute inset-0 rounded-xl bg-emerald-500/10 blur-md" />
                  <div className="absolute left-2 top-1/2 h-9 w-[2px] -translate-y-1/2 rounded-full bg-emerald-400/80" />
                </>
              )}
              <div
                className={`relative flex h-9 w-9 items-center justify-center rounded-lg border border-transparent transition-all duration-200 ${
                  isActive
                    ? "bg-emerald-500/15 text-black dark:text-white border-emerald-400/40 shadow-inner shadow-emerald-500/30"
                    : "bg-muted text-muted-foreground group-hover:text-foreground group-hover:border-border/70"
                } ${isActive ? "scale-105" : "group-hover:scale-105"}`}
              >
                {item.icon}
              </div>
              <span className="relative">{item.label}</span>
              {isActive && (
                <div className="ml-auto h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.95)]" />
              )}
            </Link>
          );
        })}
      </div>

      <AiProgressBanner />

      <div className="py-0 px-3 space-y-1">
        <div className="pt-2 mt-2 border-t border-border/40">
          <a
            href="/manual/apotto-manual.docx"
            download="Apotto_フォーム自動送信マニュアル配布用.docx"
            onClick={(e) => {
              if (isBusy) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            aria-disabled={isBusy}
            tabIndex={isBusy ? -1 : 0}
            title={busyTitle}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted ${
              isBusy
                ? "pointer-events-none opacity-40 cursor-not-allowed grayscale"
                : ""
            }`}
          >
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-muted text-muted-foreground transition-all duration-200 group-hover:text-foreground group-hover:border-border/70 group-hover:scale-105">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <span className="flex-1">マニュアル</span>
            <svg
              className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </a>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border/50 bg-muted/10">
        <Tooltip
          label="ユーザー情報を確認"
          position="right"
          withArrow
          arrowSize={6}
          offset={10}
          openDelay={300}
          transitionProps={{ transition: "fade", duration: 200 }}
          styles={{
            tooltip: {
              backgroundColor: "var(--mantine-color-dark-6)",
              color: "var(--mantine-color-white)",
              fontSize: "0.75rem",
              fontWeight: 500,
              padding: "0.5rem 0.75rem",
            },
          }}
        >
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full flex items-center gap-3 hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
          >
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-xs text-white font-bold border border-white/10 shadow-inner">
              {(userName || userEmail || "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-medium text-foreground truncate">
                {userName || " "}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {userEmail || " "}
              </p>
            </div>
          </button>
        </Tooltip>
      </div>

      <UserProfileModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        userData={{
          companyName,
          email: userEmail,
          name: userName,
        }}
        onUpdateEmail={handleUpdateEmail}
        onUpdatePassword={handleUpdatePassword}
        onLogout={handleLogout}
      />
    </aside>
  );
}
