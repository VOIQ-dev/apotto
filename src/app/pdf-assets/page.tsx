'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { Tooltip } from '@/components/ui/Tooltip';

type PdfDocument = {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  uniqueUrl: string;
  token: string;
};

const MAX_STORAGE_BYTES = 50 * 1024 * 1024; // 50MB

export default function PdfAssetsPage() {
  const [pdfs, setPdfs] = useState<PdfDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PdfDocument | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // PDF一覧を取得
  const fetchPdfs = useCallback(async () => {
    try {
      const res = await fetch('/api/pdf/list');
      if (res.ok) {
        const data = await res.json();
        setPdfs(
          data.pdfs.map((p: { id: string; filename: string; size_bytes: number; created_at: string; unique_url_token: string }) => ({
            id: p.id,
            name: p.filename,
            size: p.size_bytes,
            uploadedAt: new Date(p.created_at).toLocaleString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }),
            uniqueUrl: `${window.location.origin}/pdf/${p.unique_url_token}`,
            token: p.unique_url_token,
          }))
        );
      }
    } catch (err) {
      console.error('PDF一覧取得エラー:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPdfs();
  }, [fetchPdfs]);

  const totalSize = pdfs.reduce((sum, pdf) => sum + pdf.size, 0);
  const usagePercentage = Math.min(100, (totalSize / MAX_STORAGE_BYTES) * 100);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
    e.target.value = '';
  };

  const handleFiles = async (files: FileList) => {
    setIsUploading(true);

    for (const file of Array.from(files)) {
      if (file.type !== 'application/pdf') {
        alert(`${file.name} はPDFではありません。`);
        continue;
      }
      if (totalSize + file.size > MAX_STORAGE_BYTES) {
        alert('容量制限（50MB）を超えるためアップロードできません。');
        continue;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/pdf/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          alert(`アップロード失敗: ${err.error || '不明なエラー'}`);
          continue;
        }

        const data = await res.json();
        const newPdf: PdfDocument = {
          id: data.token,
          name: data.filename,
          size: data.size,
          uploadedAt: new Date().toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
          uniqueUrl: `${window.location.origin}${data.uniqueUrl}`,
          token: data.token,
        };
        setPdfs((prev) => [newPdf, ...prev]);
      } catch (err) {
        console.error('Upload error:', err);
        alert('アップロード中にエラーが発生しました。');
      }
    }

    setIsUploading(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    try {
      const res = await fetch(`/api/pdf/${deleteTarget.token}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPdfs((prev) => prev.filter((pdf) => pdf.id !== deleteTarget.id));
      } else {
        alert('削除に失敗しました');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('削除中にエラーが発生しました');
    }
    setDeleteTarget(null);
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground md:pl-64">
      <AppSidebar />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">PDF資料管理</h1>
            <p className="text-base text-muted-foreground max-w-2xl">
              AI生成時の添付資料として使用するPDFを管理します。登録されたPDFはユニークURL化され、開封通知や閲覧分析が可能になります。
            </p>
          </div>
        </header>

        {/* Storage Usage */}
        <section className="card-clean p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">ストレージ使用量</h3>
            <span className="text-sm font-medium text-foreground">
              {formatBytes(totalSize)} / {formatBytes(MAX_STORAGE_BYTES)} ({usagePercentage.toFixed(1)}%)
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out ${
                usagePercentage > 90 ? 'bg-rose-500' : 'bg-primary'
              }`}
              style={{ width: `${usagePercentage}%` }}
            />
          </div>
        </section>

        {/* Drag & Drop Area */}
        <section>
          <label
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`dropzone group relative flex flex-col items-center justify-center rounded-2xl p-12 text-center cursor-pointer ${
              isDragging ? 'is-active' : ''
            }`}
          >
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileInput}
              className="sr-only"
            />
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full mb-4 transition-colors ${
                isDragging
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary'
              }`}
            >
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-lg font-bold text-foreground">PDFをここにドラッグ＆ドロップ</p>
            <p className="text-sm text-muted-foreground mt-2">またはクリックしてファイルを選択</p>
            <p className="text-xs text-muted-foreground/70 mt-4">最大 50MB までアップロード可能</p>
          </label>
        </section>

        {/* PDF List */}
        <section className="card-clean">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">ファイル名</th>
                  <th className="px-6 py-4 font-medium">サイズ</th>
                  <th className="px-6 py-4 font-medium">アップロード日時</th>
                  <th className="px-6 py-4 font-medium">ユニークURL (発行例)</th>
                  <th className="px-6 py-4 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <svg
                          className="h-8 w-8 animate-spin text-primary"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span className="text-sm text-muted-foreground">PDF一覧を読み込み中...</span>
                      </div>
                    </td>
                  </tr>
                ) : pdfs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      PDFが登録されていません
                    </td>
                  </tr>
                ) : (
                  pdfs.map((pdf) => (
                    <tr key={pdf.id} className="group hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 flex-shrink-0 rounded bg-rose-500/10 text-rose-500 flex items-center justify-center">
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-1 17v-1h2v1h-2zm0-12v10h2v-10h-2z" fillOpacity="0" /><path d="M7 6h10v12h-10z" fill="none" /><path d="M11.25 2h1.5v1.5h-1.5z" fillOpacity="0" /><path d="M19.5 3h-15c-1.103 0-2 .897-2 2v14c0 1.103.897 2 2 2h15c1.103 0 2-.897 2-2v-14c0-1.103-.897-2-2-2zm-3 14h-9v-10h9v10z" opacity=".5" /><path d="M7 6h10v10h-10z" fillOpacity=".2" /></svg>
                          </div>
                          <Tooltip content={pdf.name} className="block max-w-[220px]">
                            <span className="font-medium text-foreground truncate block cursor-help">
                              {pdf.name}
                            </span>
                          </Tooltip>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                        {formatBytes(pdf.size)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                        {pdf.uploadedAt}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Tooltip content={pdf.uniqueUrl} className="block max-w-[200px]">
                            <code className="bg-black/20 rounded px-2 py-1 text-xs font-mono truncate block">
                              {pdf.uniqueUrl}
                            </code>
                          </Tooltip>
                          <button
                            onClick={async () => {
                              await navigator.clipboard.writeText(pdf.uniqueUrl);
                              setCopiedId(pdf.id);
                              setTimeout(() => setCopiedId((prev) => (prev === pdf.id ? null : prev)), 1000);
                            }}
                            className={`p-1 rounded transition-colors ${
                              copiedId === pdf.id
                                ? 'text-emerald-400 bg-emerald-500/10'
                                : 'text-primary hover:text-primary/80 hover:bg-primary/10'
                            }`}
                            title="コピー"
                          >
                            {copiedId === pdf.id ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setDeleteTarget(pdf)}
                          className="text-sm text-rose-500 hover:text-rose-300 transition-colors font-semibold"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-slate-950/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)] space-y-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-delete-title"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-rose-500/15 text-rose-400 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v4m0 4h.01M5 7h14M9 7l1-2h4l1 2m2 0v11a2 2 0 01-2 2H9a2 2 0 01-2-2V7" />
                </svg>
              </div>
              <div>
                <p id="pdf-delete-title" className="text-lg font-semibold text-foreground">
                  PDFを削除しますか？
                </p>
                <p className="text-sm text-muted-foreground">
                  削除後はリンク経由で閲覧できなくなります。この操作は取り消せません。
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground truncate">{deleteTarget.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                サイズ: {formatBytes(deleteTarget.size)} ・ 登録日時: {deleteTarget.uploadedAt}
              </p>
              <div className="mt-2 text-xs text-muted-foreground break-all">
                URL: {deleteTarget.uniqueUrl}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary text-sm px-4"
                onClick={handleDeleteCancel}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-400"
                onClick={handleDeleteConfirm}
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

