/// <reference types="chrome" />

import { useState, useEffect, useCallback } from "react";
import { QueueItem } from "../lib/queue";

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

type TabType = "queue" | "logs";

// アイコンコンポーネント
const Icons = {
  ArrowLeft: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  ),
  Pause: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Play: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Trash: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  ),
  Queue: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6h16M4 10h16M4 14h16M4 18h16"
      />
    </svg>
  ),
  AlertCircle: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  CheckCircle: () => (
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
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Clock: () => (
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
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Loader: ({ animate = false }: { animate?: boolean }) => (
    <svg
      className={`w-5 h-5 ${animate ? "animate-spin" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  ),
  XCircle: () => (
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
        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Mail: () => (
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
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  ),
  FileText: () => (
    <svg
      className="w-4 h-4"
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
  InboxEmpty: () => (
    <svg
      className="w-12 h-12"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  ),
};

export default function App() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<QueueStats>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("queue");
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [maxConcurrent, setMaxConcurrent] = useState(3); // 並行タブ数（表示用）
  const [showDeleteModal, setShowDeleteModal] = useState(false); // 削除確認モーダル

  // 並行タブ数をストレージから読み込み（表示用）
  useEffect(() => {
    chrome.storage.local.get("maxConcurrent").then((result) => {
      if (result.maxConcurrent) {
        setMaxConcurrent(result.maxConcurrent);
      }
    });
    // ストレージの変更を監視
    const listener = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes.maxConcurrent) {
        setMaxConcurrent(changes.maxConcurrent.newValue || 3);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_QUEUE_STATUS",
      });
      if (response.success) {
        setItems(response.data);
        const newStats = {
          pending: response.data.filter(
            (i: QueueItem) => i.status === "pending",
          ).length,
          processing: response.data.filter(
            (i: QueueItem) => i.status === "processing",
          ).length,
          completed: response.data.filter(
            (i: QueueItem) => i.status === "completed",
          ).length,
          failed: response.data.filter((i: QueueItem) => i.status === "failed")
            .length,
        };
        setStats(newStats);
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleClearCompletedAndFailed = async () => {
    await chrome.runtime.sendMessage({ type: "CLEAR_COMPLETED_AND_FAILED" });
    setShowDeleteModal(false);
    fetchStatus();
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "badge badge-pending",
      processing: "badge badge-processing",
      completed: "badge badge-completed",
      failed: "badge badge-failed",
    };
    const labels: Record<string, string> = {
      pending: "待機中",
      processing: "処理中",
      completed: "成功",
      failed: "失敗",
    };
    return {
      className: styles[status] || "badge",
      label: labels[status] || status,
    };
  };

  if (isLoading) {
    return (
      <div className="w-full min-w-[320px] h-[400px] flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          <span className="text-sm text-[var(--muted-foreground)]">
            読み込み中...
          </span>
        </div>
      </div>
    );
  }

  // 詳細モーダル
  if (selectedItem) {
    const badge = getStatusBadge(selectedItem.status);
    return (
      <div className="w-full min-w-[320px] min-h-[400px] bg-[var(--background)] animate-fade-in">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border)] bg-[var(--card)]">
          <button
            onClick={() => setSelectedItem(null)}
            className="p-2 hover:bg-[var(--muted)] rounded-lg transition-colors"
          >
            <Icons.ArrowLeft />
          </button>
          <h1 className="text-base font-semibold">詳細ログ</h1>
        </div>

        <div className="p-4 space-y-4">
          {/* 基本情報 */}
          <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sm truncate">
                  {selectedItem.company}
                </h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-1 break-all">
                  {selectedItem.url}
                </p>
              </div>
              <span className={badge.className}>{badge.label}</span>
            </div>
          </div>

          {/* エラー */}
          {selectedItem.error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Icons.AlertCircle />
                <h3 className="text-xs font-semibold text-red-400">エラー</h3>
              </div>
              <p className="text-xs text-red-300">{selectedItem.error}</p>
            </div>
          )}

          {/* デバッグ情報 */}
          {selectedItem.debugInfo && (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Icons.FileText />
                <h3 className="text-xs font-semibold text-blue-400">
                  デバッグ情報
                </h3>
              </div>
              <pre className="text-xs text-blue-300 whitespace-pre-wrap break-all font-mono">
                {selectedItem.debugInfo}
              </pre>
            </div>
          )}

          {/* 実行ログ */}
          {selectedItem.debugLogs && (
            <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
              <div className="flex items-center gap-2 mb-2">
                <Icons.FileText />
                <h3 className="text-xs font-semibold text-[var(--muted-foreground)]">
                  実行ログ
                </h3>
              </div>
              <pre className="text-xs text-[var(--foreground)] whitespace-pre-wrap break-all max-h-[calc(100vh-400px)] min-h-[150px] overflow-y-auto font-mono bg-[var(--background)] p-3 rounded-lg">
                {selectedItem.debugLogs}
              </pre>
            </div>
          )}

          {!selectedItem.debugLogs &&
            !selectedItem.debugInfo &&
            !selectedItem.error && (
              <p className="text-sm text-[var(--muted-foreground)] text-center py-8">
                詳細情報がありません
              </p>
            )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-[320px] min-h-[400px] bg-[var(--background)] flex flex-col">
      {/* ヘッダー */}
      <div className="p-4 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Icons.Mail />
          </div>
          <div>
            <h1 className="text-lg font-bold text-emerald-400">apotto</h1>
            <p className="text-xs text-[var(--muted-foreground)]">
              フォーム自動送信
            </p>
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-[var(--border)] bg-[var(--card)]">
        <button
          onClick={() => setActiveTab("queue")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${
            activeTab === "queue"
              ? "text-emerald-400 border-b-2 border-emerald-400"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          <Icons.Queue />
          キュー
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${
            activeTab === "logs"
              ? "text-emerald-400 border-b-2 border-emerald-400"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          <Icons.AlertCircle />
          失敗ログ
          {stats.failed > 0 && (
            <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 text-xs flex items-center justify-center">
              {stats.failed}
            </span>
          )}
        </button>
      </div>

      {activeTab === "queue" && (
        <>
          {/* 統計情報 */}
          <div className="grid grid-cols-4 gap-2 p-4 bg-[var(--card)] border-b border-[var(--border)]">
            <div className="text-center p-2 rounded-lg bg-[var(--muted)]/50">
              <div className="flex items-center justify-center text-amber-400 mb-1">
                <Icons.Clock />
              </div>
              <div className="text-lg font-bold text-amber-400">
                {stats.pending}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                待機
              </div>
            </div>
            <div className="text-center p-2 rounded-lg bg-[var(--muted)]/50">
              <div className="flex items-center justify-center text-blue-400 mb-1">
                <Icons.Loader animate={stats.processing > 0} />
              </div>
              <div className="text-lg font-bold text-blue-400">
                {stats.processing}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                処理中
              </div>
            </div>
            <div className="text-center p-2 rounded-lg bg-[var(--muted)]/50">
              <div className="flex items-center justify-center text-emerald-400 mb-1">
                <Icons.CheckCircle />
              </div>
              <div className="text-lg font-bold text-emerald-400">
                {stats.completed}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                成功
              </div>
            </div>
            <div className="text-center p-2 rounded-lg bg-[var(--muted)]/50">
              <div className="flex items-center justify-center text-red-400 mb-1">
                <Icons.XCircle />
              </div>
              <div className="text-lg font-bold text-red-400">
                {stats.failed}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                失敗
              </div>
            </div>
          </div>

          {/* 並行タブ数表示（設定はアプリ側） */}
          <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--muted-foreground)]">
                並行タブ数
              </span>
              <span className="text-xs font-medium text-[var(--foreground)]">
                {maxConcurrent}並行
              </span>
            </div>
          </div>

          {/* コントロールボタン */}
          <div className="flex gap-2 p-4 border-b border-[var(--border)]">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="btn-secondary gap-2 w-full"
              disabled={stats.completed === 0 && stats.failed === 0}
              title={
                stats.completed === 0 && stats.failed === 0
                  ? "削除するログがありません"
                  : "キューと失敗ログを削除します"
              }
            >
              <Icons.Trash />
              キューと失敗ログを削除
            </button>
          </div>

          {/* キューリスト */}
          <div className="flex-1 overflow-y-auto max-h-[calc(100vh-350px)] min-h-[200px]">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--muted-foreground)]">
                <Icons.InboxEmpty />
                <p className="mt-4 font-medium">キューが空です</p>
                <p className="text-xs mt-1">
                  Apottoからフォーム送信を開始してください
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {items
                  .sort(
                    (a, b) =>
                      new Date(b.createdAt).getTime() -
                      new Date(a.createdAt).getTime(),
                  )
                  .map((item) => {
                    const badge = getStatusBadge(item.status);
                    return (
                      <li
                        key={item.id}
                        className="p-4 hover:bg-[var(--muted)]/30 cursor-pointer transition-colors"
                        onClick={() => setSelectedItem(item)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {item.company}
                            </p>
                            <p className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">
                              {item.url}
                            </p>
                            {item.error && (
                              <p className="text-xs text-red-400 mt-1 truncate">
                                {item.error}
                              </p>
                            )}
                          </div>
                          <span className={badge.className}>{badge.label}</span>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </>
      )}

      {activeTab === "logs" && (
        <div className="flex-1 overflow-y-auto max-h-[calc(100vh-200px)] min-h-[200px]">
          {items.filter((i) => i.status === "failed").length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--muted-foreground)]">
              <Icons.CheckCircle />
              <p className="mt-4 font-medium">失敗したアイテムはありません</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {items
                .filter((i) => i.status === "failed")
                .sort(
                  (a, b) =>
                    new Date(b.failedAt || b.createdAt).getTime() -
                    new Date(a.failedAt || a.createdAt).getTime(),
                )
                .map((item) => (
                  <li
                    key={item.id}
                    className="p-4 hover:bg-[var(--muted)]/30 cursor-pointer transition-colors"
                    onClick={() => setSelectedItem(item)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {item.company}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">
                        {item.url}
                      </p>
                      <p className="text-xs text-red-400 mt-2">{item.error}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-[var(--muted-foreground)]">
                          {item.failedAt &&
                            new Date(item.failedAt).toLocaleString("ja-JP")}
                        </span>
                        {item.debugLogs && (
                          <span className="text-[10px] text-blue-400 flex items-center gap-1">
                            <Icons.FileText />
                            ログあり
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* フッター */}
      <div className="p-3 border-t border-[var(--border)] bg-[var(--card)] text-center text-[10px] text-[var(--muted-foreground)]">
        apotto v1.2.0
      </div>

      {/* 削除確認モーダル */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 max-w-sm w-full mx-4 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-[var(--foreground)] mb-3">
              キューと失敗ログを削除
            </h3>
            <p className="text-sm text-[var(--muted-foreground)] mb-2">
              成功（
              <span className="font-bold text-emerald-400">
                {stats.completed}件
              </span>
              ）と 失敗（
              <span className="font-bold text-red-400">{stats.failed}件</span>
              ）のログを削除しますか？
            </p>
            <p className="text-xs text-red-400 mb-6">
              この操作は取り消せません。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => void handleClearCompletedAndFailed()}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
