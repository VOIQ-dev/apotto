import type { SupabaseClient } from '@supabase/supabase-js';

type IncrementParams = {
  day: string; // YYYY-MM-DD
  pdfId: string;
  sentDelta?: number;
  openedDelta?: number;
};

export function formatTokyoDay(input: Date): string {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(input);
}

export function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function incrementPdfDailyMetrics(
  supabase: SupabaseClient,
  params: IncrementParams
): Promise<{ ok: boolean; usedRpc: boolean; error?: string }> {
  const sentDelta = Number.isFinite(params.sentDelta ?? 0) ? (params.sentDelta ?? 0) : 0;
  const openedDelta = Number.isFinite(params.openedDelta ?? 0)
    ? (params.openedDelta ?? 0)
    : 0;

  // Prefer atomic RPC if present
  const { error: rpcError } = await supabase.rpc('increment_pdf_daily_metrics', {
    p_day: params.day,
    p_pdf_id: params.pdfId,
    p_sent_delta: sentDelta,
    p_opened_delta: openedDelta,
  });

  if (!rpcError) {
    return { ok: true, usedRpc: true };
  }

  // Fallback: read-modify-write (non-atomic, best-effort)
  try {
    const { data: existing, error: selectError } = await supabase
      .from('pdf_daily_metrics')
      .select('sent_count, opened_count')
      .eq('day', params.day)
      .eq('pdf_id', params.pdfId)
      .maybeSingle();

    if (selectError) {
      return {
        ok: false,
        usedRpc: false,
        error: rpcError.message || selectError.message,
      };
    }

    if (existing) {
      const nextSent = (existing.sent_count ?? 0) + sentDelta;
      const nextOpened = (existing.opened_count ?? 0) + openedDelta;
      const { error: updateError } = await supabase
        .from('pdf_daily_metrics')
        .update({
          sent_count: nextSent,
          opened_count: nextOpened,
          updated_at: new Date().toISOString(),
        })
        .eq('day', params.day)
        .eq('pdf_id', params.pdfId);

      if (updateError) {
        return { ok: false, usedRpc: false, error: updateError.message };
      }
      return { ok: true, usedRpc: false };
    }

    const { error: insertError } = await supabase.from('pdf_daily_metrics').insert({
      day: params.day,
      pdf_id: params.pdfId,
      sent_count: Math.max(0, sentDelta),
      opened_count: Math.max(0, openedDelta),
    });

    if (insertError) {
      return { ok: false, usedRpc: false, error: insertError.message };
    }
    return { ok: true, usedRpc: false };
  } catch (err) {
    return {
      ok: false,
      usedRpc: false,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}





