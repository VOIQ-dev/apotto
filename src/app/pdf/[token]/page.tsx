'use client';

import { useState, useEffect, useRef, use } from 'react';

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
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
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

  // PDF.js を動的にロード & PDF 読み込み
  useEffect(() => {
    if (!pdfInfo?.signedUrl) return;

    let cancelled = false;

    const loadPdf = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const loadingTask = pdfjsLib.getDocument(pdfInfo.signedUrl);
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

        // 1秒ごとに経過時間を更新
        timerRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setStats((prev) => ({ ...prev, elapsedSeconds: elapsed }));
        }, 1000);

        // 最初のページをレンダリング
        renderPage(1, pdf);
      } catch (err) {
        console.error('PDF読み込みエラー:', err);
        if (!cancelled) {
          setError('PDFの読み込みに失敗しました。');
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
      
      // 表示領域に合わせてスケールを計算
      const containerWidth = 800;
      const viewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      // オフスクリーン canvas にレンダリング
      const canvas = document.createElement('canvas');
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const context = canvas.getContext('2d');

      if (!context) return;

      await page.render({ canvasContext: context, viewport: scaledViewport }).promise;

      // Data URL に変換して表示
      setPageImage(canvas.toDataURL('image/png'));
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

      // ログ出力
      console.log(
        `📖 読了率: ${readPercentage}% | ページ: ${pageNum}/${numPages} | 最大到達: ${maxPage}ページ | 経過時間: ${stats.elapsedSeconds}秒`
      );
    } catch (err) {
      console.error(`ページ ${pageNum} のレンダリングエラー:`, err);
    } finally {
      setPageLoading(false);
    }
  };

  // ページ移動
  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages || pageLoading) return;
    renderPage(page);
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setError('メールアドレスを入力してください。');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/pdf/${token}`);
      if (!res.ok) {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        throw new Error('PDF情報の取得に失敗しました');
      }

      const data = await res.json();
      setPdfInfo(data.pdf);
      setSubmitted(true);

      console.log(`📄 PDF閲覧開始 | ファイル: ${data.pdf.filename} | メール: ${email} | トークン: ${token}`);
    } catch (err) {
      console.error(err);
      setError('PDFの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }

  // トークンの有効性を事前チェック
  useEffect(() => {
    async function checkToken() {
      try {
        const res = await fetch(`/api/pdf/${token}`, { method: 'HEAD' });
        if (res.status === 404) {
          setNotFound(true);
        }
      } catch {
        // エラーは無視
      }
    }
    checkToken();
  }, [token]);

  // 時間フォーマット
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // リセット
  const handleReset = () => {
    console.log(
      `📄 PDF閲覧終了 | 読了率: ${stats.readPercentage}% | 最大到達ページ: ${stats.maxPageReached}/${stats.totalPages} | 閲覧時間: ${formatTime(stats.elapsedSeconds)}`
    );
    setSubmitted(false);
    setEmail('');
    setPdfInfo(null);
    pdfDocRef.current = null;
    setCurrentPage(1);
    setTotalPages(0);
    setPageImage(null);
    setStats({
      currentPage: 1,
      totalPages: 0,
      maxPageReached: 1,
      readPercentage: 0,
      elapsedSeconds: 0,
    });
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-900">PDFが見つかりません</h1>
          <p className="mt-2 text-slate-600">このリンクは無効か、PDFが削除された可能性があります。</p>
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
              <span className="text-sm font-medium text-slate-900">Cookie とプライバシーについて</span>
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="閉じる"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* コンテンツ */}
            <div className="px-4 py-3 text-xs text-slate-600 leading-relaxed">
              <p>
                弊社では、Cookie を使用して、サービスの提供、改善、保護、宣伝を行っています。
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
                をご覧ください。以下の「Cookie をカスタマイズする」ボタンを使用して、「私の個人データを第三者に販売または共有しない」設定を含む、個人設定を管理できます。
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
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-3xl bg-white p-6 shadow-xl ring-1 ring-slate-100">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            apotto
          </p>
          <h1 className="mt-2 text-2xl font-semibold">資料閲覧ページ</h1>
          <p className="mt-1 text-sm text-slate-600">
            セキュアなPDF閲覧のため、メールアドレスを入力した方のみ表示します。
          </p>
        </header>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md mx-auto w-full">
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
              {loading ? '読み込み中...' : '次へ'}
            </button>
          </form>
        ) : pdfInfo ? (
          <div className="space-y-4">
            {/* ステータスバー */}
            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <div>
                  <p>
                    <span className="font-semibold text-slate-900">{email}</span> として閲覧中
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    ファイル: {pdfInfo.filename}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900">{stats.readPercentage}%</p>
                  <p className="text-xs text-slate-500">読了率</p>
                </div>
              </div>
              {/* プログレスバー */}
              <div className="mt-3 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${stats.readPercentage}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>閲覧時間: {formatTime(stats.elapsedSeconds)}</span>
                <span>最大到達: {stats.maxPageReached}ページ</span>
              </div>
            </div>

            {/* ページナビゲーション */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1 || pageLoading}
                className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                前へ
              </button>
              <span className="text-sm font-medium text-slate-700">
                {currentPage} / {totalPages} ページ
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages || pageLoading}
                className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                次へ
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* PDF表示エリア */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center min-h-[60vh]">
              {pageLoading || !pageImage ? (
                <div className="text-slate-500 py-20">
                  {pageLoading ? 'ページ読み込み中...' : 'PDF読み込み中...'}
                </div>
              ) : (
                <img
                  src={pageImage}
                  alt={`ページ ${currentPage}`}
                  className="max-w-full h-auto"
                />
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* ページジャンプ */}
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm text-slate-600">ページ移動:</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value, 10);
                  if (page >= 1 && page <= totalPages) {
                    goToPage(page);
                  }
                }}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm"
              />
              <span className="text-sm text-slate-600">/ {totalPages}</span>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              別のアドレスで閲覧する
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

