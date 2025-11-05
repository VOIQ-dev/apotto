import { NextRequest } from 'next/server';
import { autoSubmit } from '@/lib/autoSubmit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { url, company, person, name, email, phone, subject, message, debug } =
    body ?? {};

  if (!url || typeof url !== 'string') {
    return new Response(
      JSON.stringify({
        success: false,
        logs: ['Invalid url'],
        note: 'url is required',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const result = await autoSubmit({
      url,
      company,
      person,
      name,
      email,
      phone,
      subject,
      message,
      debug,
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    const msg = error?.message ?? String(error);
    return new Response(
      JSON.stringify({ success: false, logs: ['Server error', msg] }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
