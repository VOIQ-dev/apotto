import { NextResponse } from 'next/server';

import { clearBackofficeAuthCookie } from '@/lib/backofficeAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ success: true });
  clearBackofficeAuthCookie(res);
  return res;
}





