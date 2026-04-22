"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type PersistedCard = {
  id: string;
  companyName?: string;
  status: "pending" | "generating" | "ready" | "error";
};

type PersistedQueue = {
  pendingIds?: string[];
  running?: boolean;
};

const STORAGE_CARDS = "ai-custom:cards";
const STORAGE_QUEUE = "ai-custom:queueState";
const POLL_INTERVAL_MS = 2000;

function readSnapshot(): {
  generating: number;
  pending: number;
  ready: number;
  error: number;
  total: number;
} {
  if (typeof window === "undefined") {
    return { generating: 0, pending: 0, ready: 0, error: 0, total: 0 };
  }
  try {
    const rawCards = localStorage.getItem(STORAGE_CARDS);
    const cards: PersistedCard[] = rawCards ? JSON.parse(rawCards) : [];
    if (!Array.isArray(cards)) {
      return { generating: 0, pending: 0, ready: 0, error: 0, total: 0 };
    }
    const rawQueue = localStorage.getItem(STORAGE_QUEUE);
    const queue: PersistedQueue = rawQueue ? JSON.parse(rawQueue) : {};
    const queued = new Set(queue?.pendingIds ?? []);
    let generating = 0;
    let pending = 0;
    let ready = 0;
    let error = 0;
    for (const card of cards) {
      if (card.status === "generating") generating += 1;
      else if (card.status === "ready") ready += 1;
      else if (card.status === "error") error += 1;
      else pending += 1;
    }
    // キューに積まれている件数も「生成待ち」として合算
    const queuedCount = cards.filter(
      (card) => queued.has(card.id) && card.status !== "generating",
    ).length;
    return {
      generating: generating + queuedCount,
      pending: pending - queuedCount > 0 ? pending - queuedCount : 0,
      ready,
      error,
      total: cards.length,
    };
  } catch {
    return { generating: 0, pending: 0, ready: 0, error: 0, total: 0 };
  }
}

export function AiProgressBanner() {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState(() => ({
    generating: 0,
    pending: 0,
    ready: 0,
    error: 0,
    total: 0,
  }));

  useEffect(() => {
    const update = () => setSnapshot(readSnapshot());
    update();
    const timer = setInterval(update, POLL_INTERVAL_MS);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_CARDS || e.key === STORAGE_QUEUE) update();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // AI生成画面では既に詳細UIがあるのでバナーは非表示
  if (pathname?.startsWith("/ai-custom")) return null;
  if (snapshot.total === 0) return null;

  const inProgress = snapshot.generating > 0;

  return (
    <Link
      href="/ai-custom"
      className="mx-3 mb-3 block rounded-xl border border-emerald-500/40 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-xs transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-500/15"
    >
      <div className="flex items-center gap-2">
        {inProgress ? (
          <span className="inline-block h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-emerald-500 dark:bg-emerald-400" />
        ) : (
          <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500/70 dark:bg-emerald-400/60" />
        )}
        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
          {inProgress ? "AI生成中" : "AI生成データ保持中"}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
        {inProgress ? (
          <>
            生成中 {snapshot.generating}件 / 完了 {snapshot.ready}件
          </>
        ) : (
          <>
            保持中 {snapshot.total}件（完了 {snapshot.ready}
            {snapshot.error > 0 ? ` / 失敗 ${snapshot.error}` : ""}）
          </>
        )}
      </div>
      <div className="mt-1 text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
        クリックでAI生成画面に戻る →
      </div>
    </Link>
  );
}
