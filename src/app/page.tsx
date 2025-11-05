'use client';

import { useState } from 'react';

type ContactPayload = {
  url: string;
  company?: string;
  person?: string;
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  message?: string;
  debug?: boolean;
};

export default function Home() {
  const [form, setForm] = useState<ContactPayload>({ url: '' });
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<null | {
    success: boolean;
    finalUrl?: string;
    note?: string;
  }>(null);

  async function handleStart() {
    setIsRunning(true);
    setLogs([]);
    setResult(null);
    try {
      const res = await fetch('/api/auto-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setLogs(data.logs ?? []);
      setResult({
        success: !!data.success,
        finalUrl: data.finalUrl,
        note: data.note,
      });
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        `Client error: ${err?.message ?? String(err)}`,
      ]);
      setResult({ success: false });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="font-sans min-h-screen p-8 sm:p-12">
      <main className="max-w-3xl mx-auto w-full flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">問い合わせ自動送信</h1>
        <div className="grid grid-cols-1 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm">対象サイトURL</span>
            <input
              className="border rounded px-3 py-2"
              type="url"
              placeholder="https://example.com"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              required
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm">会社名</span>
              <input
                className="border rounded px-3 py-2"
                type="text"
                placeholder="株式会社サンプル"
                value={form.company ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, company: e.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">担当者名</span>
              <input
                className="border rounded px-3 py-2"
                type="text"
                placeholder="営業部 山田 太郎"
                value={form.person ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, person: e.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">お名前</span>
              <input
                className="border rounded px-3 py-2"
                type="text"
                placeholder="山田 太郎"
                value={form.name ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">メールアドレス</span>
              <input
                className="border rounded px-3 py-2"
                type="email"
                placeholder="taro@example.com"
                value={form.email ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">電話番号</span>
              <input
                className="border rounded px-3 py-2"
                type="tel"
                placeholder="090-1234-5678"
                value={form.phone ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">件名</span>
              <input
                className="border rounded px-3 py-2"
                type="text"
                placeholder="お問い合わせ"
                value={form.subject ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, subject: e.target.value }))
                }
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm">本文</span>
            <textarea
              className="border rounded px-3 py-2 min-h-32"
              placeholder="お問い合わせ内容を入力してください"
              value={form.message ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, message: e.target.value }))
              }
            />
          </label>
        </div>

        <div className="flex gap-3 items-center">
          <button
            type="button"
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
            disabled={isRunning || !form.url}
            onClick={handleStart}
          >
            {isRunning ? '実行中...' : '開始'}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={!!form.debug}
              onChange={(e) =>
                setForm((f) => ({ ...f, debug: e.target.checked }))
              }
            />
            ブラウザ表示 (デバッグ)
          </label>
          <h2 className="text-lg font-medium">ログ</h2>
          <pre className="border rounded p-3 bg-[rgba(0,0,0,0.02)] whitespace-pre-wrap text-sm min-h-24">
            {logs.length ? logs.join('\n') : '(まだログはありません)'}
          </pre>
          {result && (
            <div className="text-sm">
              <div>結果: {result.success ? '成功' : '失敗'}</div>
              {result.finalUrl ? (
                <div>
                  最終URL:{' '}
                  <a
                    className="underline"
                    href={result.finalUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {result.finalUrl}
                  </a>
                </div>
              ) : null}
              {result.note ? <div>補足: {result.note}</div> : null}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
