'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  // Cell,
  ComposedChart,
  Legend,
  Line,
  // Pie,
  // PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { createSupabaseBrowserClient } from '@/lib/supabase';
import { AppSidebar } from '@/components/AppSidebar';

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
  contentInsights: Array<{ name: string; avgTime: number; completionRate: number }>;
  weekdayPeaks: Array<{ day: string; morning: number; afternoon: number; evening: number }>;
  industryEngagement: Array<{ industry: string; responseRate: number; avgScore: number }>;
  funnel: Array<{ stage: string; value: number; delta: number }>;
};

type MetricsState = {
  loading: boolean;
  data: DashboardData;
  error?: string;
};

// const COLORS = ['#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444'];

type TooltipPayloadEntry = {
  color: string;
  name: string;
  value: number | string;
};

type CustomTooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
};

// Custom Tooltip for Recharts
const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-border bg-background/90 p-3 shadow-xl backdrop-blur-md">
        <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
        {payload.map((entry: TooltipPayloadEntry, index: number) => (
          <p key={index} className="text-xs text-muted-foreground">
            <span style={{ color: entry.color }} className="mr-1">●</span>
            {entry.name}: <span className="font-medium text-foreground">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
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
    <div className="min-h-screen bg-background text-foreground md:pl-64">
      <AppSidebar />

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
          {/* PDF Performance - Bar Chart */}
          <div className="card-clean flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-foreground">資料別の閲覧傾向</h2>
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">Top 5</span>
            </div>
            <div className="flex-1 min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={metrics.data.pdfPerformance}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                    tickFormatter={(value) => value.length > 10 ? `${value.substring(0, 10)}...` : value}
                  />
                  <Tooltip cursor={{ fill: '#1e293b', opacity: 0.4 }} content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="views" name="総閲覧数" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                  <Bar dataKey="uniqueViews" name="ユニーク数" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Timeline - Area Chart */}
          <div className="card-clean flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-foreground">時間帯ごとの反応</h2>
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">Peak Time</span>
            </div>
            <div className="flex-1 min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={metrics.data.timeline}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="slot" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="views" name="閲覧数" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorViews)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Content Engagement & Weekday Peaks */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="card-clean flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-foreground">コンテンツ滞在時間 × 完読率</h2>
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">Engagement</span>
            </div>
            <div className="flex-1 min-h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={metrics.data.contentInsights} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    yAxisId="left"
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}s`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="completionRate" name="完読率(%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="avgTime" name="平均滞在(秒)" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-clean flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-foreground">曜日別 × 時間帯ピーク</h2>
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">Heatmap</span>
            </div>
            <div className="flex-1 min-h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.data.weekdayPeaks} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="morning" stackId="time" name="午前" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="afternoon" stackId="time" name="午後" fill="#8b5cf6" />
                  <Bar dataKey="evening" stackId="time" name="夕方" fill="#f59e0b" radius={[0, 0, 6, 6]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Industry Engagement & Funnel */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Company Engagement - Radar Chart */}
          <div className="card-clean flex flex-col">
            <h2 className="text-lg font-bold text-foreground mb-4">業界別エンゲージメント</h2>
            <div className="flex-1 min-h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={metrics.data.industryEngagement}>
                  <PolarGrid stroke="#334155" />
                  <PolarAngleAxis dataKey="industry" stroke="#94a3b8" />
                  <PolarRadiusAxis angle={30} domain={[0, 80]} stroke="#475569" tickFormatter={(value) => `${value}%`} />
                  <Radar
                    name="反応率"
                    dataKey="responseRate"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.4}
                  />
                  <Radar
                    name="AIマッチ度"
                    dataKey="avgScore"
                    stroke="#0ea5e9"
                    fill="#0ea5e9"
                    fillOpacity={0.2}
                  />
                  <Legend />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-clean flex flex-col">
            <h2 className="text-lg font-bold text-foreground mb-2">カスタマーファネル</h2>
            <p className="text-sm text-muted-foreground">送信から成約までのコンバージョン推移を可視化</p>
            <div className="mt-6 space-y-6">
              {metrics.data.funnel.map((stage, index) => (
                <div key={stage.stage} className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wider">
                    <span>{stage.stage}</span>
                    <span className="font-semibold text-foreground">{stage.value.toLocaleString()}件</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${stage.value}%`,
                        background:
                          index === 0
                            ? 'linear-gradient(90deg, #34d399 0%, #10b981 100%)'
                            : index === 1
                            ? 'linear-gradient(90deg, #2dd4bf 0%, #0ea5e9 100%)'
                            : index === 2
                            ? 'linear-gradient(90deg, #c084fc 0%, #8b5cf6 100%)'
                            : 'linear-gradient(90deg, #f97316 0%, #f43f5e 100%)',
                      }}
                    />
                  </div>
                  <div className={`text-xs font-medium ${stage.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {stage.delta >= 0 ? `▲ ${stage.delta}% vs last period` : `▼ ${Math.abs(stage.delta)}% vs last period`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Latest Logs */}
        <section className="card-clean flex flex-col">
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
    contentInsights: Array.isArray(snapshot.contentInsights)
      ? (snapshot.contentInsights as DashboardData['contentInsights'])
      : buildMockData(filters).contentInsights,
    weekdayPeaks: Array.isArray(snapshot.weekdayPeaks)
      ? (snapshot.weekdayPeaks as DashboardData['weekdayPeaks'])
      : buildMockData(filters).weekdayPeaks,
    industryEngagement: Array.isArray(snapshot.industryEngagement)
      ? (snapshot.industryEngagement as DashboardData['industryEngagement'])
      : buildMockData(filters).industryEngagement,
    funnel: Array.isArray(snapshot.funnel)
      ? (snapshot.funnel as DashboardData['funnel'])
      : buildMockData(filters).funnel,
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
    { company: 'E社 (小売)', rate: 18.9 }, // Added for Pie Chart
  ];

  const timeline = ['8-10時', '10-12時', '12-14時', '14-16時', '16-18時', '18-20時'].map((slot, index) => ({
    slot,
    views: Math.round((index + 1.2) * 20 * multiplier * (Math.random() * 0.5 + 0.8)),
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

  const contentInsights = basePdf.map((pdf, index) => ({
    name: pdf.name.replace('.pdf', ''),
    avgTime: Math.round((45 + index * 15) * (filters.range === '90d' ? 1.1 : 1)),
    completionRate: Math.min(95, Math.round(58 + index * 7)),
  }));

  const weekdayPeaks = [
    { day: 'Mon', morning: 28, afternoon: 36, evening: 18 },
    { day: 'Tue', morning: 32, afternoon: 42, evening: 22 },
    { day: 'Wed', morning: 26, afternoon: 48, evening: 30 },
    { day: 'Thu', morning: 24, afternoon: 34, evening: 28 },
    { day: 'Fri', morning: 20, afternoon: 30, evening: 36 },
  ];

  const industryEngagement = [
    { industry: 'SaaS', responseRate: 72, avgScore: 65 },
    { industry: '製造', responseRate: 58, avgScore: 61 },
    { industry: '通信', responseRate: 44, avgScore: 52 },
    { industry: '金融', responseRate: 37, avgScore: 48 },
    { industry: '小売', responseRate: 33, avgScore: 45 },
  ];

  const funnel = [
    { stage: '送信完了', value: 100, delta: 3 },
    { stage: '閲覧済み', value: 68, delta: 5 },
    { stage: 'フォーム入力', value: 41, delta: -2 },
    { stage: '成約', value: 18, delta: 1 },
  ];

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
    contentInsights,
    weekdayPeaks,
    industryEngagement,
    funnel,
  };
}
