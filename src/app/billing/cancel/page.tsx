"use client";

export default function BillingCancelPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-100 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">
          決済をキャンセルしました
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          プラン選択に戻って、再度お試しください。
        </p>
        <a
          href="/billing"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-900 border border-slate-200 hover:bg-slate-50"
        >
          決済プランに戻る
        </a>
      </div>
    </main>
  );
}
