/**
 * SSRF (Server-Side Request Forgery) 対策のためのURL検証
 *
 * このモジュールは、ユーザーが指定したURLが安全かどうかを検証します。
 * 内部ネットワークやクラウドメタデータエンドポイントへのアクセスをブロックします。
 */

import { URL } from "url";

/**
 * ブロックするホスト名（完全一致）
 */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]", // IPv6 localhost
  "::1",
  // AWS メタデータエンドポイント
  "169.254.169.254",
  "169.254.170.2", // AWS ECS metadata endpoint
  // GCP メタデータエンドポイント
  "metadata.google.internal",
  "metadata",
  // Azure メタデータエンドポイント
  "169.254.169.254",
]);

/**
 * プライベートIPアドレス範囲の正規表現
 */
const PRIVATE_IP_PATTERNS = [
  // IPv4 プライベート範囲
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  // Link-local
  /^169\.254\./,
  // IPv6 プライベート範囲
  /^::1$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd00:/i,
];

/**
 * 許可するプロトコル
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * IPv4アドレスかどうかを判定
 */
function isIPv4(hostname: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

/**
 * プライベートIPアドレスかどうかを判定
 */
function isPrivateIP(hostname: string): boolean {
  // ホスト名パターンチェック
  if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return true;
  }

  // 数値IPアドレスの場合、オクテットをチェック
  if (isIPv4(hostname)) {
    const parts = hostname.split(".").map(Number);

    // 不正なオクテット
    if (parts.some((p) => p < 0 || p > 255)) {
      return true;
    }

    const [first, second] = parts;

    // 10.0.0.0/8
    if (first === 10) return true;

    // 172.16.0.0/12
    if (first === 172 && second >= 16 && second <= 31) return true;

    // 192.168.0.0/16
    if (first === 192 && second === 168) return true;

    // 127.0.0.0/8 (loopback)
    if (first === 127) return true;

    // 0.0.0.0/8
    if (first === 0) return true;

    // 169.254.0.0/16 (link-local)
    if (first === 169 && second === 254) return true;

    // Broadcast addresses
    if (first === 255) return true;
  }

  return false;
}

/**
 * URLを検証してサニタイズ
 * @param url 検証するURL
 * @param options オプション
 * @returns 検証済みのURL、または検証失敗時はnull
 */
export function validateAndSanitizeUrl(
  url: string,
  options: {
    requireHttps?: boolean; // HTTPSのみ許可（本番環境推奨）
    allowPrivateNetworks?: boolean; // プライベートネットワークを許可（デフォルト: false）
  } = {},
): { valid: boolean; url?: string; error?: string } {
  try {
    let urlString = url.trim();

    // 空文字列チェック
    if (!urlString) {
      return { valid: false, error: "URLが空です" };
    }

    // プロトコルが無い場合はhttps://を追加
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = `https://${urlString}`;
    }

    const parsed = new URL(urlString);

    // プロトコルチェック
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return {
        valid: false,
        error: `許可されていないプロトコルです: ${parsed.protocol}`,
      };
    }

    // HTTPSのみ許可（本番環境）
    if (
      options.requireHttps &&
      process.env.NODE_ENV === "production" &&
      parsed.protocol !== "https:"
    ) {
      return {
        valid: false,
        error: "本番環境ではHTTPSのみ許可されています",
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // ブロックリストチェック
    if (BLOCKED_HOSTS.has(hostname)) {
      return {
        valid: false,
        error: `ブロックされたホスト名です: ${hostname}`,
      };
    }

    // プライベートネットワークチェック
    if (!options.allowPrivateNetworks && isPrivateIP(hostname)) {
      return {
        valid: false,
        error: "プライベートネットワークへのアクセスは許可されていません",
      };
    }

    // ポート番号チェック（well-knownポート以外は警告）
    if (parsed.port) {
      const port = parseInt(parsed.port, 10);
      // 特殊なポート番号のチェック
      if (port < 1 || port > 65535) {
        return {
          valid: false,
          error: "無効なポート番号です",
        };
      }
    }

    return { valid: true, url: parsed.toString() };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "URLの解析に失敗しました",
    };
  }
}

/**
 * 開発環境用：プライベートネットワークを許可する検証
 */
export function validateUrlForDevelopment(url: string) {
  return validateAndSanitizeUrl(url, {
    requireHttps: false,
    allowPrivateNetworks: true,
  });
}

/**
 * 本番環境用：厳格な検証
 */
export function validateUrlForProduction(url: string) {
  return validateAndSanitizeUrl(url, {
    requireHttps: true,
    allowPrivateNetworks: false,
  });
}
