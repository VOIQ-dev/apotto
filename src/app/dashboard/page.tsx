'use client';

import { useEffect, useMemo, useState } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase';

type RangeFilter = '7d' | '30d' | '90d';

type DashboardFilters = {
  range: RangeFilter;
  pdfId: string;
  company: string;
};

type DashboardData = {
  summary: Array<{ label: string; value: string; helper?: string }>;
  pdfPerformance: Array<{ id: string; name: string; views: number; uniqueViews: number }>;
  companyEngagement: Array<{ company: string; rate: number }>;
  timeline: Array<{ slot: string; views: number }>;
  logs: Array<{ viewer: string; company: string; pdf: string; viewedAt: string }>;
};

type MetricsState = {
  loading: boolean;
  data: DashboardData;
  error?: string;
};

export default function DashboardPage() {
  const [filters, setFilters] = useState<DashboardFilters>({
    range: '7d',
    pdfId: 'all',
    company: 'all',
  });
  const metrics = useDashboardMetrics(filters);

  const pdfOptions = useMemo(
    () => ['all', ...metrics.data.pdfPerformance.map((pdf) => pdf.id)],
    [metrics.data.pdfPerformance]
  );
  const companyOptions = useMemo(
    () => ['all', ...metrics.data.companyEngagement.map((row) => row.company)],
    [metrics.data.companyEngagement]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation / Header Area */}
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
              A
            </div>
            <span className="text-lg font-bold tracking-tight">apotto</span>
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            Dashboard
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">管理ダッシュボード</h1>
            <p className="text-base text-muted-foreground max-w-2xl">
              資料の閲覧状況や反応率を可視化し、営業活動の改善ポイントを発見します。
            </p>
          </div>
          <div className="flex items-center gap-2">
             {/* Optional: Date display or extra actions */}
          </div>
        </header>

        {/* Filter Section */}
        <section className="card-clean sticky top-20 z-10 md:static">
          <div className="flex flex-wrap items-end gap-4">
            <FilterSelect
              label="期間"
              value={filters.range}
              options={[
                { label: '直近7日', value: '7d' },
                { label: '直近30日', value: '30d' },
                { label: '直近90日', value: '90d' },
              ]}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, range: value as RangeFilter }))
              }
            />
            <FilterSelect
              label="PDF資料"
              value={filters.pdfId}
              options={pdfOptions.map((id) => ({
                label: id === 'all' ? 'すべての資料' : metrics.data.pdfPerformance.find((pdf) => pdf.id === id)?.name ?? id,
                value: id,
              }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, pdfId: value }))}
            />
            <FilterSelect
              label="企業"
              value={filters.company}
              options={companyOptions.map((id) => ({
                label: id === 'all' ? 'すべての企業' : id,
                value: id,
              }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, company: value }))}
            />
            
            <div className="ml-auto flex items-center">
            {metrics.loading && (
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                更新中...
              </span>
            )}
            </div>
          </div>
          {metrics.error && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              ⚠️ {metrics.error} (スナップショットを表示中)
            </div>
          )}
        </section>

        {/* Summary Cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.data.summary.map((item) => (
            <div
              key={item.label}
              className="card-clean flex flex-col justify-between"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {item.label}
              </p>
                <p className="mt-2 text-3xl font-bold text-foreground tabular-nums">{item.value}</p>
              </div>
              {item.helper && (
                <p className="mt-2 text-xs text-muted-foreground">{item.helper}</p>
              )}
            </div>
          ))}
        </section>

        {/* Charts Section */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="card-clean">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-foreground">資料別の閲覧傾向</h2>
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">Top 5</span>
            </div>
            <div className="space-y-5">
              {metrics.data.pdfPerformance.map((pdf) => {
                const topViews = metrics.data.pdfPerformance[0]?.views || 1;
                const percentage = Math.min(100, (pdf.views / topViews) * 100);
                return (
                <div key={pdf.id}>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium text-foreground truncate pr-4">{pdf.name}</span>
                    <div className="flex items-center gap-4 text-muted-foreground tabular-nums">
                      <span>{pdf.views} views</span>
                    </div>
                  </div>
                  <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all duration-500 ease-out"
                        style={{ width: `${percentage}%` }}
                      />
                  </div>
                  <div className="mt-1 text-right text-xs text-muted-foreground">
                    Unique: {pdf.uniqueViews}
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <div className="card-clean">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-foreground">時間帯ごとの反応</h2>
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">Peak Time</span>
            </div>
            <div className="flex h-64 items-end justify-between gap-2 px-2">
              {metrics.data.timeline.map((slot) => {
                  const maxVal = Math.max(...metrics.data.timeline.map(t => t.views));
                  const heightPct = maxVal > 0 ? (slot.views / maxVal) * 100 : 0;
                  
                  return (
                    <div key={slot.slot} className="group flex flex-1 flex-col items-center gap-2">
                      <div className="relative w-full flex-1 flex items-end rounded-t-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div
                           className="w-full rounded-t-md bg-primary/80 transition-all duration-500 ease-out group-hover:bg-primary"
                           style={{ height: `${Math.max(4, heightPct)}%` }}
                         />
                         {/* Tooltip-ish */}
                         <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap">
                           {slot.views} views
                         </div>
                  </div>
                      <span className="text-xs font-medium text-muted-foreground text-center truncate w-full">
                        {slot.slot}
                      </span>
                </div>
                  );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="card-clean">
            <h2 className="text-lg font-bold text-foreground mb-4">企業別の反応率</h2>
            <div className="space-y-1">
              {metrics.data.companyEngagement.map((entry, i) => (
                <div key={entry.company} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'
                    }`}>
                      {i + 1}
                    </div>
                    <span className="text-sm font-medium text-foreground">{entry.company}</span>
                  </div>
                  <div className="text-right">
                     <span className="text-sm font-bold text-foreground tabular-nums">{entry.rate.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-clean flex flex-col">
            <h2 className="text-lg font-bold text-foreground mb-4">最新の閲覧ログ</h2>
            <div className="flex-1 overflow-hidden rounded-xl border border-border">
              <div className="h-full overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0 backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-3 font-medium">閲覧者</th>
                      <th className="px-4 py-3 font-medium">資料</th>
                      <th className="px-4 py-3 font-medium text-right">日時</th>
                  </tr>
                </thead>
                  <tbody className="divide-y divide-border/50">
                    {metrics.data.logs.map((log, idx) => (
                      <tr key={`${log.viewer}-${log.viewedAt}-${idx}`} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{log.company}</div>
                          <div className="text-xs text-muted-foreground">{log.viewer}</div>
                        </td>
                        <td className="px-4 py-3 text-foreground truncate max-w-[120px]">{log.pdf}</td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                          {log.viewedAt}
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
          className="appearance-none w-full min-w-[140px] rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground">
          <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd" />
          </svg>
        </div>
      </div>
    </label>
  );
}

function useDashboardMetrics(filters: DashboardFilters): MetricsState {
  const [state, setState] = useState<MetricsState>(() => ({
    loading: false,
    data: buildMockData(filters),
  }));

  useEffect(() => {
    let active = true;

    async function fetchData() {
      setState((prev) => ({ ...prev, loading: true, error: undefined }));
      try {
        const client = createSupabaseBrowserClient();
        const { data, error } = await client.rpc('dashboard_metrics', {
          range_label: filters.range,
          pdf_id: filters.pdfId === 'all' ? null : filters.pdfId,
          company_name: filters.company === 'all' ? null : filters.company,
        });
        if (error) throw error;
        if (!active) return;
        setState({
          loading: false,
          data: normalizeDashboardData(data, filters),
        });
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : 'データ取得に失敗しました。';
        setState({
          loading: false,
          data: buildMockData(filters),
          error: message,
        });
      }
    }

    void fetchData();
    return () => {
      active = false;
    };
  }, [filters]);

  return state;
}

function normalizeDashboardData(raw: unknown, filters: DashboardFilters): DashboardData {
  if (!raw || typeof raw !== 'object') {
    return buildMockData(filters);
  }
  const snapshot = raw as Record<string, unknown>;
  return {
    summary: Array.isArray(snapshot.summary)
      ? (snapshot.summary as DashboardData['summary'])
      : buildMockData(filters).summary,
    pdfPerformance: Array.isArray(snapshot.pdfPerformance)
      ? (snapshot.pdfPerformance as DashboardData['pdfPerformance'])
      : buildMockData(filters).pdfPerformance,
    companyEngagement: Array.isArray(snapshot.companyEngagement)
      ? (snapshot.companyEngagement as DashboardData['companyEngagement'])
      : buildMockData(filters).companyEngagement,
    timeline: Array.isArray(snapshot.timeline)
      ? (snapshot.timeline as DashboardData['timeline'])
      : buildMockData(filters).timeline,
    logs: Array.isArray(snapshot.logs)
      ? (snapshot.logs as DashboardData['logs'])
      : buildMockData(filters).logs,
  };
}

function buildMockData(filters: DashboardFilters): DashboardData {
  const multiplier =
    filters.range === '90d' ? 1.6 : filters.range === '30d' ? 1.2 : 1;
  const basePdf = [
    {
      id: 'pdf_overview',
      name: 'プロダクト概要.pdf',
      views: Math.round(420 * multiplier),
      uniqueViews: Math.round(210 * multiplier),
    },
    {
      id: 'pdf_case',
      name: '導入事例集.pdf',
      views: Math.round(310 * multiplier),
      uniqueViews: Math.round(180 * multiplier),
    },
    {
      id: 'pdf_pricing',
      name: '料金プラン.pdf',
      views: Math.round(240 * multiplier),
      uniqueViews: Math.round(150 * multiplier),
    },
    {
      id: 'pdf_security',
      name: 'セキュリティ白書.pdf',
      views: Math.round(180 * multiplier),
      uniqueViews: Math.round(120 * multiplier),
    },
  ];

  const companyEngagement = [
    { company: 'A社 (SaaS)', rate: 62.4 },
    { company: 'B社 (製造)', rate: 54.1 },
    { company: 'C社 (通信)', rate: 38.2 },
    { company: 'D社 (金融)', rate: 27.5 },
  ];

  const timeline = ['8-10時', '10-12時', '12-14時', '14-16時'].map((slot, index) => ({
    slot,
    views: Math.round((index + 1.2) * 20 * multiplier),
  }));

  const logs = [
    {
      viewer: 'sales@alpha.co.jp',
      company: 'αコンサル',
      pdf: 'プロダクト概要.pdf',
      viewedAt: '2025-11-17 09:24',
    },
    {
      viewer: 'it@beta.jp',
      company: 'βテック',
      pdf: 'セキュリティ白書.pdf',
      viewedAt: '2025-11-17 10:05',
    },
    {
      viewer: 'cfo@gamma.com',
      company: 'γホールディングス',
      pdf: '料金プラン.pdf',
      viewedAt: '2025-11-17 11:32',
    },
    {
      viewer: 'biz@delta.io',
      company: 'δイノベーション',
      pdf: '導入事例集.pdf',
      viewedAt: '2025-11-17 12:08',
    },
  ];

  const referenceRate = companyEngagement[0]?.rate ?? 0;

  const summary = [
    {
      label: '総閲覧数',
      value: `${basePdf.reduce((sum, pdf) => sum + pdf.views, 0)}回`,
      helper: 'ユニーク閲覧の合計も含む',
    },
    {
      label: 'ユニーク閲覧者',
      value: `${basePdf.reduce((sum, pdf) => sum + pdf.uniqueViews, 0)}名`,
      helper: 'メール認証済み',
    },
    {
      label: '平均閲覧率',
      value: `${(((referenceRate || 0) / 100) * 68).toFixed(1)}%`,
      helper: '送信企業に対する閲覧割合',
    },
    {
      label: '人気時間帯',
      value: timeline.reduce((prev, curr) => (curr.views > prev.views ? curr : prev))
        .slot,
      helper: '閲覧が集中した時間帯',
    },
  ];

  return {
    summary,
    pdfPerformance: basePdf,
    companyEngagement,
    timeline,
    logs,
  };
}
