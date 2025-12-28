'use client';

import { useMemo, useState } from 'react';

type PlanInterval = '3m' | '6m' | '12m';

const PLANS: { id: PlanInterval; label: string; desc: string }[] = [
  { id: '3m', label: '3ヶ月', desc: '月額換算 20万円 / 前払い' },
  { id: '6m', label: '6ヶ月', desc: '月額換算 15万円 / 前払い' },
  { id: '12m', label: '12ヶ月', desc: '月額換算 10万円 / 前払い' },
];

export default function BillingPage() {
  const [companyId, setCompanyId] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<PlanInterval>('3m');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const stripeEnabled = useMemo(() => (process.env.NEXT_PUBLIC_ENABLE_STRIPE || '').toLowerCase() === 'true', []);

  const handleCheckout = async () => {
    setError(null);
    setMessage(null);
    if (!companyId) {
      setError('会社IDを入力してください。');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, planInterval: plan, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '決済セッションの作成に失敗しました');
      }
      if (!data.url) {
        throw new Error('決済URLが取得できませんでした');
      }
      if (data.message) {
        setMessage(data.message);
      }
      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-100">
        <header className="mb-6 border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">apotto</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">決済プラン</h1>
          <p className="mt-1 text-sm text-slate-600">
            Stripe Checkout へ遷移して購入します。スタブ設定の場合はモックURLにリダイレクトします。
          </p>
          {!stripeEnabled && (
            <p className="mt-2 text-sm text-amber-600">
              現在 ENABLE_STRIPE=false のため、モックURLに遷移します（課金は発生しません）。
            </p>
          )}
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {PLANS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlan(p.id)}
              className={`rounded-xl border p-4 text-left transition ${
                plan === p.id ? 'border-slate-900 shadow-md' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-slate-900">{p.label}</span>
                {plan === p.id && <span className="text-xs rounded-full bg-slate-900 px-2 py-1 text-white">選択中</span>}
              </div>
              <p className="mt-2 text-sm text-slate-600">{p.desc}</p>
            </button>
          ))}
        </section>

        <section className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">
              会社ID
              <input
                type="text"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                placeholder="company-uuid"
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">Stripe metadata と subscriptions に保存されます。</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              連絡先メールアドレス（任意）
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@example.com"
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">自動招待や領収書送付に使用されます。</p>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {message && <p className="text-sm text-amber-600">{message}</p>}
          <button
            onClick={handleCheckout}
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'リダイレクト準備中...' : 'Stripe Checkoutへ進む'}
          </button>
        </section>
      </div>
    </main>
  );
}





