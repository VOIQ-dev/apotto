import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 環境変数確認用（本番では削除すること）
export async function GET() {
  const envFiles = getEnvFilesInfo();
  const envLocal = readDotEnvFile(envFiles['.env.local']?.path);
  const envDot = readDotEnvFile(envFiles['.env']?.path);

  // 優先順位（Next.js の慣習）: .env.local -> .env
  const envFromFiles = { ...envDot, ...envLocal };

  const env = {
    // 最初の10文字と最後の5文字のみ表示（セキュリティのため）
    SUPABASE_URL: maskEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_ANON_KEY: maskEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: maskEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
    OPENAI_API_KEY: maskEnv(process.env.OPENAI_API_KEY),
    STRIPE_SECRET_KEY: maskEnv(process.env.STRIPE_SECRET_KEY),
    AWS_ACCESS_KEY_ID: maskEnv(process.env.AWS_ACCESS_KEY_ID),
    
    // 存在チェック
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasOpenAiKey: !!process.env.OPENAI_API_KEY,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    hasAwsKey: !!process.env.AWS_ACCESS_KEY_ID,

    // 参考: envファイル側の値（マスク表示）
    envFile: {
      SUPABASE_URL: maskEnv(envFromFiles.NEXT_PUBLIC_SUPABASE_URL),
      SUPABASE_ANON_KEY: maskEnv(envFromFiles.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      SUPABASE_SERVICE_ROLE_KEY: maskEnv(envFromFiles.SUPABASE_SERVICE_ROLE_KEY),
      OPENAI_API_KEY: maskEnv(envFromFiles.OPENAI_API_KEY),
      STRIPE_SECRET_KEY: maskEnv(envFromFiles.STRIPE_SECRET_KEY),
      AWS_ACCESS_KEY_ID: maskEnv(envFromFiles.AWS_ACCESS_KEY_ID),
    },

    // 重要: 実行中プロセスと envファイルの一致判定
    matchesEnvFile: {
      SUPABASE_URL:
        !!envFromFiles.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_URL === envFromFiles.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_ANON_KEY:
        !!envFromFiles.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === envFromFiles.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY:
        !!envFromFiles.SUPABASE_SERVICE_ROLE_KEY &&
        process.env.SUPABASE_SERVICE_ROLE_KEY === envFromFiles.SUPABASE_SERVICE_ROLE_KEY,
      OPENAI_API_KEY:
        !!envFromFiles.OPENAI_API_KEY && process.env.OPENAI_API_KEY === envFromFiles.OPENAI_API_KEY,
      STRIPE_SECRET_KEY:
        !!envFromFiles.STRIPE_SECRET_KEY &&
        process.env.STRIPE_SECRET_KEY === envFromFiles.STRIPE_SECRET_KEY,
      AWS_ACCESS_KEY_ID:
        !!envFromFiles.AWS_ACCESS_KEY_ID &&
        process.env.AWS_ACCESS_KEY_ID === envFromFiles.AWS_ACCESS_KEY_ID,
    },

    // デバッグ: 読み取り対象ファイルの有無/更新時刻
    envFiles,
  };

  return NextResponse.json(env);
}

function maskEnv(value: string | undefined): string {
  if (!value) return '未設定';
  if (value.length <= 15) return '***設定済***';
  return `${value.slice(0, 10)}...${value.slice(-5)}`;
}

function getEnvFilesInfo(): Record<
  '.env.local' | '.env',
  { path: string; exists: boolean; mtimeMs?: number; size?: number }
> {
  const root = process.cwd();
  const candidates = ['.env.local', '.env'] as const;
  const info = {} as Record<
    '.env.local' | '.env',
    { path: string; exists: boolean; mtimeMs?: number; size?: number }
  >;

  for (const name of candidates) {
    const filePath = path.join(root, name);
    try {
      const stat = fs.statSync(filePath);
      info[name] = { path: filePath, exists: true, mtimeMs: stat.mtimeMs, size: stat.size };
    } catch {
      info[name] = { path: filePath, exists: false };
    }
  }

  return info;
}

function readDotEnvFile(filePath: string | undefined): Record<string, string> {
  if (!filePath) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return parseDotEnv(content);
  } catch {
    return {};
  }
}

function parseDotEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice('export '.length) : line;
    const eqIndex = normalized.indexOf('=');
    if (eqIndex === -1) continue;

    const key = normalized.slice(0, eqIndex).trim();
    if (!key) continue;

    let value = normalized.slice(eqIndex + 1).trim();

    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (!isQuoted) {
      value = value.replace(/\s+#.*$/, '').trim();
    }

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\n/g, '\n');
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

