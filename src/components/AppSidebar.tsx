"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function AppSidebar() {
  const [userName, setUserName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const pathname = usePathname();

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
  ];

  useEffect(() => {
    // 画面左下に表示するユーザー情報を取得
    // /api/account/me のレスポンスを想定（account.display_name / account.email）
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/account/me", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as {
          account?: { display_name?: string | null; email?: string | null };
        };
        setUserName((data.account?.display_name ?? "").trim());
        setUserEmail((data.account?.email ?? "").trim());
      } catch {
        // fail silently
      }
    };
    void fetchUser();
  }, []);

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
              className={`relative group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "text-foreground shadow-[0_10px_40px_rgba(16,185,129,0.18)] ring-1 ring-emerald-400/30 bg-gradient-to-r from-emerald-500/15 via-emerald-400/10 to-transparent"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
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

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border/50 bg-muted/10">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-xs text-white font-bold border border-white/10 shadow-inner">
            {(userName || userEmail || "U").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              {userName || " "}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {userEmail || " "}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
