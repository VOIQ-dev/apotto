import { NextRequest, NextResponse } from 'next/server';

import { isBackofficeAuthenticated } from '@/lib/backofficeAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    authenticated: isBackofficeAuthenticated(request),
  });
}





