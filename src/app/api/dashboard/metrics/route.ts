import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '@/lib/supabaseServer';
import { clampInt, formatTokyoDay } from '@/lib/pdfTracking';
import { applyAuthCookies, getAccountContextFromRequest } from '@/lib/routeAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RangeLabel = '7d' | '30d' | '90d';

type DashboardResponse = {
  summary: Array<{ label: string; value: string; helper?: string }>;
  pdfPerformance: Array<{ id: string; name: string; views: number; uniqueViews: number }>;
  companyEngagement: Array<{ company: string; rate: number }>;
  timeline: Array<{ slot: string; views: number }>;
  logs: Array<{ viewer: string; company: string; pdf: string; viewedAt: string }>;
  contentInsights: Array<{ name: string; avgTime: number; completionRate: number }>;
  weekdayPeaks: Array<{ day: string; morning: number; afternoon: number; evening: number }>;
  industryEngagement: Array<{ industry: string; responseRate: number; avgScore: number }>;
  funnel: Array<{ stage: string; value: number; delta: number }>;
  intentScores: Array<{
    company: string;
    contact?: string;
    email?: string;
    score: number;
    lastViewedAt?: string;
    pdf?: string;
  }>;
  options: {
    pdfs: Array<{ id: string; name: string }>;
    companies: string[];
  };
};

type PdfDailyMetricsRow = {
  day: string;
  pdf_id: string;
  sent_count: number | null;
  opened_count: number | null;
};

type PdfSendLogIdRow = { id: string };

type PdfOpenEventRow = {
  pdf_id: string;
  pdf_send_log_id: string;
  viewer_email: string;
  opened_at: string;
  read_percentage_max: number | null;
  elapsed_seconds_max: number | null;
};

type PdfSendLogRow = {
  id: string;
  pdf_id?: string | null;
  recipient_company_name: string | null;
  recipient_homepage_url: string | null;
  recipient_email?: string | null;
  sent_at?: string | null;
  first_opened_at?: string | null;
};

type PdfRow = { id: string; original_filename: string | null };

type WeekdayPeakBuckets = { morning: number; afternoon: number; evening: number };

type CompanyOptionRow = { recipient_company_name: string | null };

function parseRangeLabel(input: string | null): RangeLabel {
  if (input === '30d' || input === '90d') return input;
  return '7d';
}

function getRangeDays(label: RangeLabel): number {
  return label === '90d' ? 90 : label === '30d' ? 30 : 7;
}

function getTokyoParts(date: Date) {
  const fmt = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    y: get('year'),
    mo: get('month'),
    d: get('day'),
    h: clampInt(get('hour'), 0, 23),
    mi: get('minute'),
    dow: new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      weekday: 'short',
    }).format(date),
  };
}

function slot2h(hour: number): string {
  const start = Math.floor(hour / 2) * 2;
  const end = start + 2;
  return `${start}-${end}時`;
}

export async function GET(request: NextRequest) {
  try {
    const { user, companyId, cookieMutations } =
      await getAccountContextFromRequest(request);
    const json = (body: unknown, init?: { status?: number }) => {
      const res = NextResponse.json(body, { status: init?.status });
      applyAuthCookies(res, cookieMutations);
      return res;
    };

    if (!user) return json({ error: '認証が必要です' }, { status: 401 });
    if (!companyId) return json({ error: '会社情報が紐づいていません' }, { status: 403 });

    const supabase = createSupabaseServiceClient();

    const url = new URL(request.url);
    const rangeLabel = parseRangeLabel(url.searchParams.get('range_label'));
    const rangeDays = getRangeDays(rangeLabel);
    const pdfId = url.searchParams.get('pdf_id')?.trim() || null;
    const companyName = url.searchParams.get('company_name')?.trim() || null;

    const start = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const startIso = start.toISOString();
    const startDay = formatTokyoDay(start);

    // Filter options (for UI selects)
    const optionPdfs: DashboardResponse['options']['pdfs'] = [];
    const optionCompanies: string[] = [];
    {
      // pdf list
      const { data: pdfRows, error: pdfErr } = await supabase
        .from('pdfs')
        .select('id, original_filename, is_deleted')
        .eq('company_id', companyId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(500);

      if (pdfErr) {
        console.error('[dashboard/metrics] pdf options error', pdfErr);
      } else {
        for (const row of (pdfRows ?? []) as unknown as Array<{
          id: string;
          original_filename: string | null;
        }>) {
          optionPdfs.push({
            id: String(row.id),
            name: String(row.original_filename ?? 'PDF'),
          });
        }
      }

      // company list (unique, recent range)
      let companyRows: CompanyOptionRow[] = [];
      {
        const buildCompanyQuery = () => {
          let q = supabase
            .from('pdf_send_logs')
            .select('recipient_company_name')
            .eq('company_id', companyId)
            .limit(8000);
          if (pdfId) q = q.eq('pdf_id', pdfId);
          return q;
        };

        // sent_at がない環境もあり得るので、まずは sent_at で絞り、失敗したら全件(上限)でフォールバック
        const { data, error } = await buildCompanyQuery().gte('sent_at', startIso);
        if (error) {
          const { data: fallback, error: fallbackErr } = await buildCompanyQuery();
          if (fallbackErr) {
            console.error('[dashboard/metrics] company options error', fallbackErr);
          } else {
            companyRows = (fallback ?? []) as unknown as CompanyOptionRow[];
          }
        } else {
          companyRows = (data ?? []) as unknown as CompanyOptionRow[];
        }
      }

      const set = new Set<string>();
      for (const row of companyRows) {
        const name = String(row.recipient_company_name ?? '').trim();
        if (!name) continue;
        set.add(name);
      }
      optionCompanies.push(...Array.from(set).sort((a, b) => a.localeCompare(b, 'ja')));
    }

    // PDFフィルタが他社PDFを指していないかガード
    if (pdfId && !optionPdfs.some((p) => p.id === pdfId)) {
      return json({ error: 'PDFが見つかりません' }, { status: 404 });
    }

    // Daily metrics (sent/opened) for open-rate
    let sentTotal = 0;
    let openedTotal = 0;
    if (companyName) {
      // 会社フィルタ時は日次集計に company 情報がないため、送信ログから算出する
      const baseQ = () => {
        let q = supabase
          .from('pdf_send_logs')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('recipient_company_name', companyName)
          .gte('sent_at', startIso)
          .not('recipient_homepage_url', 'is', null)
          .neq('recipient_homepage_url', '');
        if (pdfId) q = q.eq('pdf_id', pdfId);
        return q;
      };

      const { count: sentCount, error: sentErr } = await baseQ();
      if (sentErr) {
        console.error('[dashboard/metrics] sent count error', sentErr);
      } else {
        sentTotal = Number(sentCount ?? 0);
      }

      const { count: openedCount, error: openedErr } = await baseQ().not(
        'first_opened_at',
        'is',
        null
      );
      if (openedErr) {
        console.error('[dashboard/metrics] opened count error', openedErr);
      } else {
        openedTotal = Number(openedCount ?? 0);
      }
    } else {
      {
        const scopePdfIds = optionPdfs.map((p) => p.id);
        const shouldQuery = Boolean(pdfId) || scopePdfIds.length > 0;
        if (shouldQuery) {
          let q = supabase
            .from('pdf_daily_metrics')
            .select('day, pdf_id, sent_count, opened_count')
            .gte('day', startDay);
          if (pdfId) q = q.eq('pdf_id', pdfId);
          else q = q.in('pdf_id', scopePdfIds);
          const { data, error } = await q;
          if (error) {
            console.error('[dashboard/metrics] pdf_daily_metrics error', error);
          } else {
            for (const row of (data ?? []) as unknown as PdfDailyMetricsRow[]) {
              sentTotal += Number(row.sent_count ?? 0);
              openedTotal += Number(row.opened_count ?? 0);
            }
          }
        }
      }
    }

    // Open events in range
    let openEvents: PdfOpenEventRow[] = [];

    if (companyName) {
      // 会社フィルタは open_events → send_logs をJOINして絞る（first_opened_at依存を避ける）
      let evQ = supabase
        .from('pdf_open_events')
        .select(
          'pdf_id, pdf_send_log_id, viewer_email, opened_at, read_percentage_max, elapsed_seconds_max, pdf_send_logs!inner(recipient_company_name)'
        )
        .eq('company_id', companyId)
        .gte('opened_at', startIso)
        .eq('pdf_send_logs.recipient_company_name', companyName)
        .order('opened_at', { ascending: false })
        .limit(8000);
      if (pdfId) evQ = evQ.eq('pdf_id', pdfId);
      const { data: evs, error: evErr } = await evQ;
      if (evErr) {
        console.error('[dashboard/metrics] open_events error', evErr);
      } else {
        // JOIN結果の余分なプロパティを落として型を揃える
        openEvents = (evs ?? []).map((row) => ({
          pdf_id: String((row as { pdf_id: unknown }).pdf_id),
          pdf_send_log_id: String((row as { pdf_send_log_id: unknown }).pdf_send_log_id),
          viewer_email: String((row as { viewer_email: unknown }).viewer_email),
          opened_at: String((row as { opened_at: unknown }).opened_at),
          read_percentage_max: (row as { read_percentage_max?: number | null }).read_percentage_max ?? null,
          elapsed_seconds_max: (row as { elapsed_seconds_max?: number | null }).elapsed_seconds_max ?? null,
        }));
      }
    } else {
      let evQ = supabase
        .from('pdf_open_events')
        .select(
          'pdf_id, pdf_send_log_id, viewer_email, opened_at, read_percentage_max, elapsed_seconds_max'
        )
        .eq('company_id', companyId)
        .gte('opened_at', startIso)
        .order('opened_at', { ascending: false })
        .limit(8000);
      if (pdfId) evQ = evQ.eq('pdf_id', pdfId);
      const { data: evs, error: evErr } = await evQ;
      if (evErr) {
        console.error('[dashboard/metrics] open_events error', evErr);
      } else {
        openEvents = (evs ?? []) as unknown as PdfOpenEventRow[];
      }
    }

    const viewerSet = new Set(openEvents.map((e) => e.viewer_email));

    // openイベントを send_log_id ごとに最新 opened_at でマップ（viewer_email含む）
    const openInfoMap = new Map<
      string,
      { viewerEmail: string; openedAt: string; pdfId: string }
    >();
    for (const ev of openEvents) {
      const existed = openInfoMap.get(ev.pdf_send_log_id);
      if (!existed || new Date(ev.opened_at).getTime() > new Date(existed.openedAt).getTime()) {
        openInfoMap.set(ev.pdf_send_log_id, {
          viewerEmail: ev.viewer_email,
          openedAt: ev.opened_at,
          pdfId: ev.pdf_id,
        });
      }
    }

    // Fetch send logs for mapping company names
    const sendLogIds = Array.from(new Set(openEvents.map((e) => e.pdf_send_log_id)));
    const sendLogMap = new Map<string, { company: string }>();
    const sendLogDetail: Array<{
      id: string;
      pdfId: string;
      company: string;
      email: string;
      sentAt?: string;
      firstOpenedAt?: string | null;
    }> = [];
    if (sendLogIds.length) {
      const { data: logs, error: logsErr } = await supabase
        .from('pdf_send_logs')
        .select(
          'id, pdf_id, recipient_company_name, recipient_homepage_url, recipient_email, sent_at, first_opened_at'
        )
        .eq('company_id', companyId)
        .in('id', sendLogIds)
        .limit(8000);
      if (logsErr) {
        console.error('[dashboard/metrics] send_logs map error', logsErr);
      } else {
        for (const row of (logs ?? []) as unknown as PdfSendLogRow[]) {
          const id = String(row.id);
          const company =
            String(row.recipient_company_name ?? '').trim() ||
            String(row.recipient_homepage_url ?? '').trim() ||
            '(不明)';
          sendLogMap.set(id, { company });
          sendLogDetail.push({
            id,
            pdfId: String(row.pdf_id ?? ''),
            company,
            email: String(row.recipient_email ?? '').trim(),
            sentAt: row.sent_at ?? undefined,
            firstOpenedAt: row.first_opened_at ?? null,
          });
        }
      }
    }

    // Fetch pdf names
    const pdfIds = Array.from(new Set(openEvents.map((e) => e.pdf_id)));
    if (pdfId && !pdfIds.includes(pdfId)) pdfIds.push(pdfId);
    const pdfMap = new Map<string, string>();
    if (pdfIds.length) {
      const { data: pdfRows, error: pdfErr } = await supabase
        .from('pdfs')
        .select('id, original_filename')
        .eq('company_id', companyId)
        .in('id', pdfIds)
        .limit(5000);
      if (pdfErr) {
        console.error('[dashboard/metrics] pdfs map error', pdfErr);
      } else {
        for (const row of (pdfRows ?? []) as unknown as PdfRow[]) {
          pdfMap.set(String(row.id), String(row.original_filename ?? 'PDF'));
        }
      }
    }

    // pdfPerformance
    const pdfPerfMap = new Map<
      string,
      { id: string; name: string; views: number; viewers: Set<string> }
    >();
    for (const ev of openEvents) {
      const id = ev.pdf_id;
      const current = pdfPerfMap.get(id) ?? {
        id,
        name: pdfMap.get(id) ?? id,
        views: 0,
        viewers: new Set<string>(),
      };
      current.views += 1;
      current.viewers.add(ev.viewer_email);
      pdfPerfMap.set(id, current);
    }
    const pdfPerformance = Array.from(pdfPerfMap.values())
      .map((p) => ({
        id: p.id,
        name: p.name,
        views: p.views,
        uniqueViews: p.viewers.size,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8);

    // companyEngagement (avg completion)
    const companyAgg = new Map<string, { sum: number; count: number }>();
    for (const ev of openEvents) {
      const company = sendLogMap.get(ev.pdf_send_log_id)?.company ?? '(不明)';
      const prev = companyAgg.get(company) ?? { sum: 0, count: 0 };
      prev.sum += Number(ev.read_percentage_max ?? 0);
      prev.count += 1;
      companyAgg.set(company, prev);
    }
    const companyEngagement = Array.from(companyAgg.entries())
      .map(([company, agg]) => ({
        company,
        rate: agg.count ? Number((agg.sum / agg.count).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 20);

    // timeline (2h slots)
    const slotAgg = new Map<string, number>();
    for (const ev of openEvents) {
      const date = new Date(ev.opened_at);
      const parts = getTokyoParts(date);
      const slot = slot2h(parts.h);
      slotAgg.set(slot, (slotAgg.get(slot) ?? 0) + 1);
    }
    const timeline = Array.from(slotAgg.entries())
      .map(([slot, views]) => ({ slot, views }))
      .sort((a, b) => {
        const ah = clampInt(a.slot.split('-')[0], 0, 23);
        const bh = clampInt(b.slot.split('-')[0], 0, 23);
        return ah - bh;
      });
    const peakSlot = timeline.reduce(
      (prev, curr) => (curr.views > prev.views ? curr : prev),
      timeline[0] ?? { slot: '-', views: 0 }
    ).slot;

    // logs (latest 50)
    const logs = openEvents.slice(0, 50).map((ev) => {
      const company = sendLogMap.get(ev.pdf_send_log_id)?.company ?? '(不明)';
      const pdfName = pdfMap.get(ev.pdf_id) ?? ev.pdf_id;
      const date = new Date(ev.opened_at);
      const parts = getTokyoParts(date);
      const viewedAt = `${parts.y}-${parts.mo}-${parts.d} ${String(parts.h).padStart(2, '0')}:${parts.mi}`;
      return {
        viewer: ev.viewer_email,
        company,
        pdf: pdfName,
        viewedAt,
      };
    });

    // contentInsights (avg time & completion per PDF)
    const contentAgg = new Map<
      string,
      { name: string; sumTime: number; sumComp: number; count: number }
    >();
    for (const ev of openEvents) {
      const id = ev.pdf_id;
      const prev = contentAgg.get(id) ?? {
        name: (pdfMap.get(id) ?? id).replace(/\.pdf$/i, ''),
        sumTime: 0,
        sumComp: 0,
        count: 0,
      };
      prev.sumTime += Number(ev.elapsed_seconds_max ?? 0);
      prev.sumComp += Number(ev.read_percentage_max ?? 0);
      prev.count += 1;
      contentAgg.set(id, prev);
    }
    const contentInsights = Array.from(contentAgg.values()).map((agg) => ({
      name: agg.name,
      avgTime: agg.count ? Math.round(agg.sumTime / agg.count) : 0,
      completionRate: agg.count ? Math.round(agg.sumComp / agg.count) : 0,
    }));

    // weekdayPeaks
    const weekdayMap = new Map<string, WeekdayPeakBuckets>();
    for (const ev of openEvents) {
      const d = new Date(ev.opened_at);
      const parts = getTokyoParts(d);
      const bucket =
        parts.h < 12 ? 'morning' : parts.h < 17 ? 'afternoon' : 'evening';
      const prev = weekdayMap.get(parts.dow) ?? { morning: 0, afternoon: 0, evening: 0 };
      prev[bucket] += 1;
      weekdayMap.set(parts.dow, prev);
    }
    const weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekdayPeaks: DashboardResponse['weekdayPeaks'] = weekdayOrder
      .map((day) => {
        const buckets = weekdayMap.get(day);
        if (!buckets) return null;
        return { day, ...buckets };
      })
      .filter((row): row is DashboardResponse['weekdayPeaks'][number] => Boolean(row));

    const viewRateRaw = sentTotal > 0 ? (openedTotal / sentTotal) * 100 : 0;
    const viewRate = Math.max(0, Math.min(100, viewRateRaw));

    const summary: DashboardResponse['summary'] = [
      {
        label: '総閲覧数',
        value: `${openEvents.length}回`,
        helper: '閲覧開始（メール入力後）の総数',
      },
      {
        label: 'ユニーク閲覧者',
        value: `${viewerSet.size}名`,
        helper: '入力されたメールアドレスのユニーク数',
      },
      {
        label: '平均閲覧率',
        value: `${viewRate.toFixed(1)}%`,
        helper: '送信成功（分母）に対する閲覧済み企業（分子）',
      },
      {
        label: '人気時間帯',
        value: peakSlot,
        helper: '閲覧が多い時間帯',
      },
    ];

    const funnel: DashboardResponse['funnel'] = [
      { stage: '送信完了', value: 100, delta: 0 },
      { stage: '閲覧済み', value: Math.round(viewRate), delta: 0 },
      { stage: 'フォーム入力', value: 0, delta: 0 },
      { stage: '成約', value: 0, delta: 0 },
    ];

    // Intent scores: classify by送信→初回開封までの時間
    const intentScores = sendLogDetail.map((log) => {
      const openInfo = openInfoMap.get(log.id);
      const sentAt = log.sentAt ? new Date(log.sentAt) : null;
      const openedAt = openInfo?.openedAt
        ? new Date(openInfo.openedAt)
        : log.firstOpenedAt
        ? new Date(log.firstOpenedAt)
        : null;
      let score = 30;
      if (sentAt && openedAt) {
        const diffHours = (openedAt.getTime() - sentAt.getTime()) / (1000 * 60 * 60);
        if (diffHours <= 24) score = 90;
        else if (diffHours <= 72) score = 60;
        else score = 30;
      } else if (sentAt) {
        // 未開封: Low
        score = 30;
      }
      const pdfName = (pdfMap.get(log.pdfId) ?? pdfMap.get(openInfo?.pdfId ?? '') ?? log.pdfId) || '-';
      const emailDisplay = (openInfo?.viewerEmail ?? log.email ?? '').trim();
      const lastViewedAt = openedAt
        ? (() => {
            const parts = getTokyoParts(openedAt);
            return `${parts.y}-${parts.mo}-${parts.d} ${String(parts.h).padStart(2, '0')}:${parts.mi}`;
          })()
        : '';
      return {
        company: log.company,
        contact: '',
        email: emailDisplay || '',
        score,
        lastViewedAt,
        pdf: pdfName,
      };
    });

    const out: DashboardResponse = {
      summary,
      pdfPerformance,
      companyEngagement,
      timeline,
      logs,
      contentInsights,
      weekdayPeaks,
      industryEngagement: [],
      funnel,
      intentScores,
      options: {
        pdfs: optionPdfs,
        companies: optionCompanies,
      },
    };

    return json(out);
  } catch (err) {
    console.error('[dashboard/metrics] Unexpected error', err);
    return NextResponse.json({ error: 'データ取得に失敗しました。' }, { status: 500 });
  }
}


