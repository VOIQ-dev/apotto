"use client";

import { useState, useEffect, useRef, use, useCallback } from "react";

// アイドルタイムアウト（5分）
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

type PdfTokenPageProps = {
  params: Promise<{ token: string }>;
};

type PdfInfo = {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
  signedUrl: string;
  totalPages?: number;
};

type ReadingStats = {
  currentPage: number;
  totalPages: number;
  maxPageReached: number;
  readPercentage: number;
  elapsedSeconds: number;
};

export default function PdfTokenPage({ params }: PdfTokenPageProps) {
  const { token } = use(params);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(true);

  // ページ送り式の表示
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<unknown>(null);

  // 読了率・時間計測
  const [stats, setStats] = useState<ReadingStats>({
    currentPage: 1,
    totalPages: 0,
    maxPageReached: 1,
    readPercentage: 0,
    elapsedSeconds: 0,
  });
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // アイドルタイムアウト用
  const lastActivityRef = useRef<number>(Date.now());
  const activeElapsedRef = useRef<number>(0); // アイドル時間を除いた実際の閲覧時間

  // セッションID管理
  const getOrCreateSessionId = useCallback(() => {
    if (typeof window === "undefined") return "";
    const key = `pdf_session_${token}`;
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  }, [token]);

  // 操作検知（アイドルタイマーリセット）
  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // PDF.js を動的にロード & PDF 読み込み
  useEffect(() => {
    if (!pdfInfo?.signedUrl) return;

    let cancelled = false;

    const loadPdf = async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        // CORSを避けるため一度フェッチしてバイナリで渡す
        const res = await fetch(pdfInfo.signedUrl);
        if (!res.ok) {
          throw new Error(`failed to fetch pdf: ${res.status}`);
        }
        const buffer = await res.arrayBuffer();

        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setStats((prev) => ({
          ...prev,
          totalPages: pdf.numPages,
          readPercentage: Math.round((1 / pdf.numPages) * 100),
        }));

        // 閲覧開始時刻を記録
        startTimeRef.current = Date.now();
        lastActivityRef.current = Date.now();
        activeElapsedRef.current = 0;

        // 1秒ごとに経過時間を更新（アイドルタイムアウト考慮）
        timerRef.current = setInterval(() => {
          const now = Date.now();
          const timeSinceLastActivity = now - lastActivityRef.current;

          // 5分以上操作がなければアイドル状態 → カウント停止
          if (timeSinceLastActivity > IDLE_TIMEOUT_MS) {
            return;
          }

          // アクティブな時間のみカウント
          activeElapsedRef.current += 1;
          setStats((prev) => ({
            ...prev,
            elapsedSeconds: activeElapsedRef.current,
          }));
        }, 1000);

        // 最初のページをレンダリング
        renderPage(1, pdf);
      } catch (err) {
        console.error("PDF読み込みエラー:", err);
        if (!cancelled) {
          setError("PDFの読み込みに失敗しました。");
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfInfo?.signedUrl]);

  // ページをレンダリング
  const renderPage = async (pageNum: number, pdfDoc?: unknown) => {
    const doc = pdfDoc || pdfDocRef.current;
    if (!doc) return;

    setPageLoading(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page = await (doc as any).getPage(pageNum);

      // 表示領域に合わせてスケールを計算（高さベースでアスペクト比維持）
      // ビューポートの高さの80%を使用（ナビゲーション用のスペースを確保）
      const containerHeight =
        typeof window !== "undefined" ? window.innerHeight * 0.75 : 600;
      const viewport = page.getViewport({ scale: 1 });
      const scale = containerHeight / viewport.height;
      const scaledViewport = page.getViewport({ scale });

      // オフスクリーン canvas にレンダリング
      const canvas = document.createElement("canvas");
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const context = canvas.getContext("2d");

      if (!context) return;

      await page.render({ canvasContext: context, viewport: scaledViewport })
        .promise;

      // Data URL に変換して表示
      setPageImage(canvas.toDataURL("image/png"));
      setCurrentPage(pageNum);

      // 読了率を更新
      const maxPage = Math.max(stats.maxPageReached, pageNum);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const numPages = (doc as any).numPages;
      const readPercentage = Math.round((maxPage / numPages) * 100);

      setStats((prev) => ({
        ...prev,
        currentPage: pageNum,
        maxPageReached: maxPage,
        readPercentage,
      }));

      // 進捗をサーバへ保存（ベストエフォート）
      if (submitted && email.trim()) {
        void fetch(`/api/pdf/${token}/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            viewer_email: email.trim(),
            read_percentage: readPercentage,
            max_page_reached: maxPage,
            elapsed_seconds: activeElapsedRef.current,
          }),
        }).catch(() => {
          // ignore
        });
      }
    } catch (err) {
      console.error(`ページ ${pageNum} のレンダリングエラー:`, err);
    } finally {
      setPageLoading(false);
    }
  };

  // ページ移動
  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages || pageLoading) return;
    resetIdleTimer(); // 操作検知
    renderPage(page);
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setError("メールアドレスを入力してください。");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/pdf/${token}/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewer_email: email.trim(),
          session_id: getOrCreateSessionId(),
        }),
      });
      if (!res.ok) {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (res.status === 410) {
          setRevoked(true);
          return;
        }
        throw new Error("PDF情報の取得に失敗しました");
      }

      const data = await res.json();
      setPdfInfo(data.pdf);
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("PDFの読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  // トークンの有効性を事前チェック
  useEffect(() => {
    async function checkToken() {
      try {
        const res = await fetch(`/api/pdf/${token}`, { method: "HEAD" });
        if (res.status === 404) setNotFound(true);
        if (res.status === 410) setRevoked(true);
      } catch {
        // エラーは無視
      }
    }
    checkToken();
  }, [token]);

  // beforeunloadで最終進捗を送信
  useEffect(() => {
    if (!submitted || !email.trim()) return;

    const handleBeforeUnload = () => {
      // sendBeaconを使用して非同期でも送信保証
      const data = JSON.stringify({
        viewer_email: email.trim(),
        read_percentage: stats.readPercentage,
        max_page_reached: stats.maxPageReached,
        elapsed_seconds: activeElapsedRef.current,
      });
      navigator.sendBeacon(`/api/pdf/${token}/progress`, data);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [submitted, email, token, stats.readPercentage, stats.maxPageReached]);

  if (notFound || revoked) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-900">
            {notFound ? "PDFが見つかりません" : "この資料は削除されました"}
          </h1>
          <p className="mt-2 text-slate-600">
            {notFound
              ? "このリンクは無効か、PDFが削除された可能性があります。"
              : "指定された資料は削除済みのため閲覧できません。"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-8 text-slate-900 relative">
      {/* 左下プライバシーモーダル */}
      {!submitted && showPrivacyModal && (
        <div className="fixed bottom-4 left-4 z-50 w-full max-w-md animate-in slide-in-from-bottom-4 duration-300">
          <div className="rounded-xl border border-slate-700 bg-white shadow-2xl overflow-hidden">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <span className="text-sm font-medium text-slate-900">
                Cookie とプライバシーについて
              </span>
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="閉じる"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            {/* コンテンツ */}
            <div className="px-4 py-3 text-xs text-slate-600 leading-relaxed">
              <p>
                弊社では、Cookie
                を使用して、サービスの提供、改善、保護、宣伝を行っています。
                詳細については、
                <a
                  href="https://voiq.jp/404-1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  プライバシー ポリシー
                </a>
                や
                <a
                  href="https://voiq.jp/404-1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  プライバシー ポリシーに関するよくある質問
                </a>
                をご覧ください。以下の「Cookie
                をカスタマイズする」ボタンを使用して、「私の個人データを第三者に販売または共有しない」設定を含む、個人設定を管理できます。
              </p>
            </div>
            {/* フッターボタン */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="text-xs text-slate-600 hover:text-slate-900 underline"
              >
                Cookie をカスタマイズする
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className="px-4 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 transition-colors"
                >
                  拒否
                </button>
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors"
                >
                  すべて承諾
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div
        className={`mx-auto flex w-full flex-col gap-6 rounded-3xl bg-white p-6 shadow-xl ring-1 ring-slate-100 ${submitted ? "max-w-7xl" : "max-w-4xl"}`}
      >
        {!submitted && (
          <header className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              apotto
            </p>
            <h1 className="mt-2 text-2xl font-semibold">PDF閲覧</h1>
            <p className="mt-1 text-sm text-slate-600">
              PDFを表示するためにメールアドレスを入力してください。
            </p>
          </header>
        )}

        {!submitted ? (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 max-w-md mx-auto w-full"
          >
            <label className="text-sm font-medium text-slate-700">
              メールアドレス
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                disabled={loading}
              />
            </label>

            {error && <p className="text-sm text-rose-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "読み込み中..." : "次へ"}
            </button>
          </form>
        ) : pdfInfo ? (
          <div className="space-y-4">
            {/* ページナビゲーション */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1 || pageLoading}
                className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                前へ
              </button>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages || pageLoading}
                className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                次へ
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>

            {/* PDF表示エリア */}
            <div
              className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center"
              style={{ height: "75vh" }}
            >
              {pageLoading || !pageImage ? (
                <div className="text-slate-500 py-20">
                  {pageLoading ? "ページ読み込み中..." : "PDF読み込み中..."}
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pageImage}
                  alt={`ページ ${currentPage}`}
                  className="h-full w-auto object-contain"
                />
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
