"use client";

import { useState, useEffect, useCallback } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Tooltip } from "@mantine/core";

type PdfDocument = {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  // 企業別URLは送信時に発行されるため、管理画面では固定URLを表示しない
  uniqueUrl: string | null;
};

const MAX_STORAGE_BYTES = 15 * 1024 * 1024; // 15MB

type ErrorModal = { title: string; message: string };

export default function PdfAssetsPage() {
  const [pdfs, setPdfs] = useState<PdfDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PdfDocument | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorModal, setErrorModal] = useState<ErrorModal | null>(null);

  const showError = (title: string, message: string) => {
    setErrorModal({ title, message });
  };

  // PDF一覧を取得
  const fetchPdfs = useCallback(async () => {
    try {
      const res = await fetch("/api/pdf/list");
      if (res.ok) {
        const data = await res.json();
        setPdfs(
          (data.pdfs ?? []).map(
            (p: {
              id: string;
              filename: string;
              size_bytes: number;
              created_at: string;
            }) => ({
              id: p.id,
              name: p.filename,
              size: p.size_bytes,
              uploadedAt: new Date(p.created_at).toLocaleString("ja-JP", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              }),
              uniqueUrl: null,
            }),
          ),
        );
      }
    } catch (err) {
      console.error("PDF一覧取得エラー:", err);
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
    e.target.value = "";
  };

  const handleFiles = async (files: FileList) => {
    setIsUploading(true);

    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf") {
        showError(
          "ファイル形式エラー",
          `「${file.name}」はPDFではありません。PDFファイルのみアップロード可能です。`,
        );
        continue;
      }
      if (file.size > MAX_STORAGE_BYTES) {
        showError(
          "ファイルサイズ超過",
          `「${file.name}」のファイルサイズが15MBを超えているため、アップロードできません。`,
        );
        continue;
      }
      if (totalSize + file.size > MAX_STORAGE_BYTES) {
        showError(
          "ストレージ容量不足",
          `ストレージの残り容量が不足しているため「${file.name}」をアップロードできません。不要なPDFを削除してから再度お試しください。`,
        );
        continue;
      }
      if (pdfs.some((p) => p.name === file.name)) {
        showError(
          "同名ファイルが存在します",
          `「${file.name}」は既に登録されています。別のファイル名に変更してからアップロードしてください。`,
        );
        continue;
      }

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/pdf/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          const isDuplicate = res.status === 409;
          showError(
            isDuplicate ? "同名ファイルが存在します" : "アップロード失敗",
            err.error || "不明なエラーが発生しました。",
          );
          continue;
        }

        const data = await res.json();
        const pdfId: string | null = data.id ? String(data.id) : null;
        const newPdf: PdfDocument = {
          id: pdfId ?? crypto.randomUUID(),
          name: data.filename,
          size: data.size,
          uploadedAt: new Date().toLocaleString("ja-JP", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
          uniqueUrl: null,
        };
        setPdfs((prev) => [newPdf, ...prev]);
      } catch (err) {
        console.error("Upload error:", err);
        showError(
          "アップロードエラー",
          "アップロード中に予期しないエラーが発生しました。しばらくしてから再度お試しください。",
        );
      }
    }

    setIsUploading(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    try {
      const res = await fetch(`/api/pdf/by-id/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPdfs((prev) => prev.filter((pdf) => pdf.id !== deleteTarget.id));
      } else {
        showError("削除失敗", "PDFの削除に失敗しました。再度お試しください。");
      }
    } catch (err) {
      console.error("Delete error:", err);
      showError(
        "削除エラー",
        "削除中に予期しないエラーが発生しました。しばらくしてから再度お試しください。",
      );
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
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              PDF資料管理
            </h1>
            <p className="text-base text-muted-foreground max-w-2xl">
              AI生成時の添付資料として使用するPDFを管理します。登録されたPDFはユニークURL化され、開封通知や閲覧分析が可能になります。
            </p>
          </div>
        </header>

        {/* Storage Usage */}
        <section className="card-clean p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              ストレージ使用量
            </h3>
            <span className="text-sm font-medium text-foreground">
              {formatBytes(totalSize)} / {formatBytes(MAX_STORAGE_BYTES)} (
              {usagePercentage.toFixed(1)}%)
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out ${
                usagePercentage > 90 ? "bg-rose-500" : "bg-primary"
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
              isDragging ? "is-active" : ""
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
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
              }`}
            >
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <p className="text-lg font-bold text-foreground">
              PDFをここにドラッグ＆ドロップ
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              またはクリックしてファイルを選択
            </p>
            <p className="text-xs text-muted-foreground/70 mt-4">
              最大 15MB までアップロード可能
            </p>
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
                  <th className="px-6 py-4 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12">
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
                        <span className="text-sm text-muted-foreground">
                          PDF一覧を読み込み中...
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : pdfs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-12 text-center text-muted-foreground"
                    >
                      PDFが登録されていません
                    </td>
                  </tr>
                ) : (
                  pdfs.map((pdf) => (
                    <tr
                      key={pdf.id}
                      className="group hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Tooltip label={pdf.name} position="top" withArrow>
                          <span className="font-medium text-foreground truncate block max-w-[500px]">
                            {pdf.name}
                          </span>
                        </Tooltip>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                        {formatBytes(pdf.size)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                        {pdf.uploadedAt}
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

      {errorModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setErrorModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl ring-1 ring-black/5 dark:ring-white/5 animate-in fade-in zoom-in-95 duration-200"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              borderWidth: "1px",
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-error-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div
                className="h-14 w-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(245, 158, 11, 0.15)" }}
              >
                <svg
                  className="w-7 h-7 text-amber-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
              </div>

              <div className="space-y-1.5">
                <p
                  id="pdf-error-title"
                  className="text-base font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  {errorModal.title}
                </p>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {errorModal.message}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="mt-6 w-full btn-primary"
              onClick={() => setErrorModal(null)}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={handleDeleteCancel}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl ring-1 ring-black/5 dark:ring-white/5 animate-in fade-in zoom-in-95 duration-200"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              borderWidth: "1px",
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div
                className="h-14 w-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(244, 63, 94, 0.15)" }}
              >
                <svg
                  className="w-7 h-7 text-rose-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </div>

              <div className="space-y-1.5">
                <p
                  id="pdf-delete-title"
                  className="text-base font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  PDFを削除しますか？
                </p>
                <p
                  className="text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  この操作は取り消せません。
                </p>
              </div>
            </div>

            <div
              className="mt-4 rounded-xl px-4 py-3"
              style={{
                backgroundColor: "var(--muted)",
                border: "1px solid var(--border)",
              }}
            >
              <p
                className="text-sm font-medium truncate"
                style={{ color: "var(--foreground)" }}
              >
                {deleteTarget.name}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                {formatBytes(deleteTarget.size)} ・ {deleteTarget.uploadedAt}
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="flex-1 btn-secondary"
                onClick={handleDeleteCancel}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="flex-1 inline-flex items-center justify-center rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600"
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
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
