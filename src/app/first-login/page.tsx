"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase";

type MeResponse = {
  success?: boolean;
  user?: { email?: string; metadata?: Record<string, unknown> };
  mustChangePassword?: boolean;
  error?: string;
};

export default function FirstLoginPage() {
  const router = useRouter();
  const supabaseRef = useRef<SupabaseClient | null>(null);
  if (typeof window !== "undefined" && !supabaseRef.current) {
    supabaseRef.current = createSupabaseBrowserClient();
  }
  const supabase = supabaseRef.current;

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setError(null);
      try {
        const res = await fetch("/api/account/me");
        const data = (await res.json().catch(() => ({}))) as MeResponse;
        if (!active) return;

        if (!res.ok) {
          router.replace("/login");
          return;
        }

        const must = Boolean(data.mustChangePassword);
        const userEmail = String(data.user?.email ?? "");
        setEmail(userEmail);

        if (!must) {
          router.replace("/ai-custom");
          return;
        }

        setLoading(false);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
        setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const p1 = newPassword.trim();
    const p2 = confirmPassword.trim();
    if (p1.length < 8) {
      setError("新しいパスワードは8文字以上にしてください");
      return;
    }
    if (p1 !== p2) {
      setError("パスワード（確認）が一致しません");
      return;
    }

    setSubmitting(true);
    try {
      if (!supabase) throw new Error("クライアント未初期化");
      const { error: updateError } = await supabase.auth.updateUser({
        password: p1,
        data: { must_change_password: false },
      });
      if (updateError) throw updateError;

      // DB側の状態も active に更新
      await fetch("/api/account/activate", { method: "POST" }).catch(
        () => null,
      );

      // セッションを一旦切って、新しいパスワードで再ログインする導線にする
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
      router.replace("/login?changed=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-[420px] animate-in fade-in zoom-in-95 duration-500">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            初回ログイン設定
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            まずパスワードを変更してください。
          </p>
        </div>

        <div className="card-clean shadow-xl shadow-slate-200/50 ring-1 ring-slate-200 dark:shadow-none dark:ring-border">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              読み込み中...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-xs text-muted-foreground">
                ログイン中:{" "}
                <span className="font-medium text-foreground">
                  {email || "-"}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  新しいパスワード
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-clean"
                  placeholder="8文字以上"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  新しいパスワード（確認）
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-clean"
                  placeholder="もう一度入力"
                  autoComplete="new-password"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full"
              >
                {submitting ? "更新中..." : "パスワードを更新してログインへ"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
