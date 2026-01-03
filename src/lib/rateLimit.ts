/**
 * レート制限 (Rate Limiting)
 *
 * ブルートフォース攻撃やDDoS攻撃を防ぐため、
 * APIエンドポイントへのリクエスト数を制限します。
 */

import { NextRequest } from "next/server";

type RateLimitConfig = {
  windowMs: number; // 時間窓（ミリ秒）
  maxRequests: number; // 最大リクエスト数
};

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

// インメモリストア（本番環境ではRedisなどを推奨）
const requestCounts = new Map<string, RateLimitRecord>();

/**
 * クライアント識別子を取得
 * IPアドレスを優先的に使用し、取得できない場合はUser-Agentを使用
 */
function getClientIdentifier(request: NextRequest): string {
  // X-Forwarded-For を優先（プロキシ背後の場合）
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0].trim();
    if (ip) return ip;
  }

  // X-Real-IP を確認
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  // IPアドレスが取得できない場合はUser-Agentを使用（fallback）
  const userAgent = request.headers.get("user-agent");
  if (userAgent) return `ua:${userAgent}`;

  // 最終的なfallback
  return "unknown";
}

/**
 * レート制限をチェック
 * @param request リクエスト
 * @param config 設定
 * @param identifier カスタム識別子（オプション）
 * @returns 許可される場合はtrue
 */
export function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  identifier?: string,
): { allowed: boolean; remaining: number; resetAt: number } {
  const clientId = identifier || getClientIdentifier(request);
  const now = Date.now();
  const record = requestCounts.get(clientId);

  // レコードが存在しない、または期限切れの場合
  if (!record || now > record.resetAt) {
    const newRecord: RateLimitRecord = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    requestCounts.set(clientId, newRecord);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: newRecord.resetAt,
    };
  }

  // レート制限超過チェック
  if (record.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
    };
  }

  // カウントを増やす
  record.count++;

  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetAt: record.resetAt,
  };
}

/**
 * レート制限ミドルウェア
 * 使用例: const rateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5 });
 */
export function createRateLimiter(config: RateLimitConfig) {
  return (request: NextRequest, identifier?: string) => {
    return checkRateLimit(request, config, identifier);
  };
}

/**
 * 事前定義されたレート制限設定
 */
export const RateLimitPresets = {
  /** ログイン: 15分で5回まで */
  login: { windowMs: 15 * 60 * 1000, maxRequests: 5 },

  /** 一般API: 1分で60回まで */
  api: { windowMs: 60 * 1000, maxRequests: 60 },

  /** 厳格: 1分で10回まで */
  strict: { windowMs: 60 * 1000, maxRequests: 10 },

  /** 緩い: 1分で100回まで */
  lenient: { windowMs: 60 * 1000, maxRequests: 100 },

  /** 問い合わせフォーム: 1時間で3回まで */
  contactForm: { windowMs: 60 * 60 * 1000, maxRequests: 3 },
};

/**
 * 定期的にクリーンアップ（メモリリーク防止）
 * 期限切れのレコードを削除
 */
function cleanupExpiredRecords() {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (now > record.resetAt) {
      requestCounts.delete(key);
    }
  }
}

// 1分ごとにクリーンアップを実行
if (typeof global !== "undefined") {
  setInterval(cleanupExpiredRecords, 60000);
}

/**
 * レート制限情報をレスポンスヘッダーに追加
 */
export function addRateLimitHeaders(
  headers: Headers,
  result: { allowed: boolean; remaining: number; resetAt: number },
): void {
  headers.set("X-RateLimit-Limit", String(result.remaining + 1));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(Math.floor(result.resetAt / 1000)));

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    headers.set("Retry-After", String(retryAfter));
  }
}
