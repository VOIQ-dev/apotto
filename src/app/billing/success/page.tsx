'use client';

import { useMemo } from 'react';

export default function BillingSuccessPage() {
  const params = useMemo(() => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''), []);
  const sessionId = params.get('session_id');
  const mode = params.get('mode');

  const isStub = mode === 'disabled' || sessionId === 'test_session_mock';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-100 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">決済が完了しました</h1>
        <p className="mt-2 text-sm text-slate-600">
          {isStub
            ? '現在はスタブモードです。実際の課金は発生していません。'
            : 'Stripe Checkout での決済が完了しました。'}
        </p>
        {sessionId && (
          <p className="mt-4 text-xs text-slate-500 break-all">session_id: {sessionId}</p>
        )}
        <a
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
        >
          ダッシュボードへ戻る
        </a>
      </div>
    </main>
  );
}





