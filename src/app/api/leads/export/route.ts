import { NextRequest, NextResponse } from 'next/server';

import {
  getAccountContextFromRequest,
  applyAuthCookies,
} from '@/lib/routeAuth';
import { createSupabaseServiceClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: CSVエクスポート
export async function GET(request: NextRequest) {
  const { companyId, cookieMutations } = await getAccountContextFromRequest(request);
  if (!companyId) {
    const res = NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  const supabase = createSupabaseServiceClient();

  // 全リード取得
  const { data: leads, error } = await supabase
    .from('lead_lists')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[leads/export] fetch error', error);
    const res = NextResponse.json({ error: 'リード取得に失敗しました' }, { status: 500 });
    applyAuthCookies(res, cookieMutations);
    return res;
  }

  // インテントスコア計算
  const leadsWithScore = await Promise.all(
    (leads || []).map(async (lead) => {
      let intentScore = '-';

      if (lead.pdf_send_log_id) {
        const { data: sendLog } = await supabase
          .from('pdf_send_logs')
          .select('sent_at')
          .eq('id', lead.pdf_send_log_id)
          .maybeSingle();

        if (sendLog?.sent_at) {
          const { data: openEvent } = await supabase
            .from('pdf_open_events')
            .select('opened_at')
            .eq('pdf_send_log_id', lead.pdf_send_log_id)
            .order('opened_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (openEvent?.opened_at) {
            const sentAt = new Date(sendLog.sent_at).getTime();
            const openedAt = new Date(openEvent.opened_at).getTime();
            const diffHours = (openedAt - sentAt) / (1000 * 60 * 60);

            if (diffHours <= 24) {
              intentScore = '高';
            } else if (diffHours <= 72) {
              intentScore = '中';
            } else {
              intentScore = '低';
            }
          } else {
            intentScore = '未開封';
          }
        }
      }

      return { ...lead, intentScore };
    })
  );

  // CSVヘッダー
  const headers = [
    '企業名',
    'URL',
    '送信結果',
    'インテントスコア',
    'アポ獲得',
    'NG企業',
    '担当者名',
    '部署名',
    '役職名',
    'メールアドレス',
  ];

  // CSV行データ
  const rows = leadsWithScore.map((lead) => [
    lead.company_name || '',
    lead.homepage_url || '',
    lead.send_status === 'success' ? '成功' : lead.send_status === 'failed' ? '失敗' : '-',
    lead.intentScore,
    lead.is_appointed ? 'あり' : '',
    lead.is_ng ? 'NG' : '',
    lead.contact_name || '',
    lead.department || '',
    lead.title || '',
    lead.email || '',
  ]);

  // CSV文字列生成
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');

  // BOM付きUTF-8
  const bom = '\uFEFF';
  const csvWithBom = bom + csvContent;

  const res = new NextResponse(csvWithBom, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
  applyAuthCookies(res, cookieMutations);
  return res;
}

