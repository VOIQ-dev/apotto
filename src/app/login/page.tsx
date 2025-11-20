'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

const MOCK_USERNAME = 'VOIQ-2025';
const MOCK_PASSWORD = 'VOIQ-2025';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    const isAuthorized = username === MOCK_USERNAME && password === MOCK_PASSWORD;

    // 擬似的な遅延を追加してUXを向上
    setTimeout(() => {
      if (!isAuthorized) {
        setError('ユーザー名またはパスワードが正しくありません。');
        setIsSubmitting(false);
        return;
      }

      document.cookie = `apotto_auth=1; path=/; max-age=${60 * 60 * 24 * 7}`;
      router.push('/ai-custom');
    }, 600);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-[400px] animate-in fade-in zoom-in-95 duration-500">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-xl font-bold text-primary">
            A
          </div>
          <h1 className="text-2xl font-bold tracking-tight">apotto にログイン</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            アカウント情報を入力してダッシュボードへアクセス
          </p>
        </div>

        <div className="card-clean shadow-xl shadow-slate-200/50 ring-1 ring-slate-200 dark:shadow-none dark:ring-border">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                ユーザー名
              </label>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="input-clean"
                placeholder="VOIQ-2025"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  パスワード
                </label>
              </div>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input-clean"
                placeholder="••••••••"
                autoComplete="current-password"
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
              disabled={isSubmitting}
              className="btn-primary w-full"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  認証中...
                </span>
              ) : (
                'ログイン'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-muted-foreground">
            <p>デモアカウント: VOIQ-2025 / VOIQ-2025</p>
          </div>
        </div>
        
        <div className="mt-8 text-center text-xs text-muted-foreground/60">
          &copy; 2025 Apotto Inc. All rights reserved.
        </div>
      </div>
    </div>
  );
}
