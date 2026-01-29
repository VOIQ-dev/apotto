"use client";

import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";

type FeedbackType = "要望" | "問い合わせ" | "バグ報告";

export default function FeedbackPage() {
  const [feedbackType, setFeedbackType] = useState<FeedbackType | "">("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const isFormValid = feedbackType !== "" && content.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid) return;

    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess(false);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          feedbackType,
          content,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "送信に失敗しました");
      }

      setSubmitSuccess(true);
      setFeedbackType("");
      setContent("");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "送信に失敗しました",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (submitSuccess) {
      const timer = setTimeout(() => {
        setSubmitSuccess(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [submitSuccess]);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />

      <main className="flex-1 md:ml-64">
        <div className="max-w-3xl mx-auto p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              フィードバック
            </h1>
            <p className="text-muted-foreground">
              ご要望、お問い合わせ、バグの報告をお送りいただけます
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="feedbackType"
                className="block text-sm font-medium text-foreground mb-2"
              >
                種別 <span className="text-red-500">*</span>
              </label>
              <select
                id="feedbackType"
                value={feedbackType}
                onChange={(e) =>
                  setFeedbackType(e.target.value as FeedbackType)
                }
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
                required
              >
                <option value="">選択してください</option>
                <option value="要望">要望</option>
                <option value="問い合わせ">問い合わせ</option>
                <option value="バグ報告">バグ報告</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="content"
                className="block text-sm font-medium text-foreground mb-2"
              >
                内容 <span className="text-red-500">*</span>
              </label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="なるべく詳細に記載してください"
                rows={10}
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all resize-none"
                required
              />
            </div>

            <div className="bg-muted/30 border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                <svg
                  className="inline w-4 h-4 mr-1"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                いただいた内容は管理者が確認し、順次対応を検討いたします。すべてのご要望に対応できるわけではございませんが、サービス改善の参考にさせていただきます。
              </p>
            </div>

            {submitSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-400/20 rounded-lg p-4">
                <p className="text-emerald-400 text-sm font-medium">
                  ✓ 送信が完了しました。ご協力ありがとうございます。
                </p>
              </div>
            )}

            {submitError && (
              <div className="bg-red-500/10 border border-red-400/20 rounded-lg p-4">
                <p className="text-red-400 text-sm font-medium">
                  {submitError}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className={`w-full px-6 py-3 rounded-lg font-semibold transition-all ${
                isFormValid && !isSubmitting
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-[0_4px_20px_rgba(16,185,129,0.4)] hover:shadow-[0_6px_24px_rgba(16,185,129,0.5)]"
                  : "bg-gray-700 dark:bg-gray-800 text-gray-400 cursor-not-allowed border border-gray-600"
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  送信中...
                </span>
              ) : (
                "送信する"
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
