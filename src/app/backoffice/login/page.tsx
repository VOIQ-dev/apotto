'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BackofficeLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [revealPassword, setRevealPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const revealPasswordFor = () => {
    setRevealPassword(true);
    window.setTimeout(() => setRevealPassword(false), 1500);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/backoffice/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean };

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'ログインに失敗しました');
      }

      router.push('/backoffice/companies');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ログインに失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-[420px] animate-in fade-in zoom-in-95 duration-500">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Backoffice</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            会社・アカウント管理用の管理者ログイン
          </p>
        </div>

        <div className="card-clean shadow-xl shadow-slate-200/50 ring-1 ring-slate-200 dark:shadow-none dark:ring-border">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                ユーザー名
              </label>
              <input
                className="input-clean"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="BACKOFFICE_USERNAME"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                パスワード
              </label>
              <div className="relative">
                <input
                  className="input-clean pr-12"
                  type={revealPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
                />
                <button
                  type="button"
                  onClick={revealPasswordFor}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                  aria-label="パスワードを表示"
                  title="1.5秒だけ表示"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? '認証中...' : 'ログイン'}
            </button>
          </form>

          <div className="mt-6 text-xs text-muted-foreground">
            環境変数: <code className="font-mono">BACKOFFICE_USERNAME</code> /{' '}
            <code className="font-mono">BACKOFFICE_PASSWORD</code>
          </div>
        </div>
      </div>
    </div>
  );
}





