/**
 * エラーメッセージ定数
 *
 * セキュリティ上の理由から、エラーメッセージは以下の原則に従う:
 * 1. 具体的な失敗理由を明かさない（例: "ユーザー名が間違っている" vs "パスワードが間違っている"）
 * 2. システムの内部構造を漏らさない
 * 3. ユーザーに必要な情報のみを提供する
 */

export const ErrorMessages = {
  // 認証関連
  AUTH: {
    INVALID_CREDENTIALS: "認証に失敗しました",
    UNAUTHORIZED: "認証が必要です",
    SESSION_EXPIRED: "セッションが期限切れです。再度ログインしてください",
    FORBIDDEN: "この操作を実行する権限がありません",
    EMAIL_NOT_CONFIRMED: "メールアドレスが未確認です",
    ACCOUNT_NOT_FOUND: "アカウントが見つかりません",
  },

  // レート制限
  RATE_LIMIT: {
    EXCEEDED: "リクエストが多すぎます。しばらく待ってから再度お試しください",
    TOO_MANY_LOGIN_ATTEMPTS:
      "ログイン試行回数が多すぎます。しばらく待ってから再度お試しください",
  },

  // バリデーション
  VALIDATION: {
    INVALID_INPUT: "入力内容に誤りがあります",
    REQUIRED_FIELD: "必須項目が入力されていません",
    INVALID_FORMAT: "形式が正しくありません",
    INVALID_EMAIL: "メールアドレスの形式が正しくありません",
    INVALID_URL: "URLの形式が正しくありません",
  },

  // サーバーエラー
  SERVER: {
    INTERNAL_ERROR: "予期しないエラーが発生しました",
    SERVICE_UNAVAILABLE:
      "サービスが一時的に利用できません。しばらく経ってから再度お試しください",
    DATABASE_ERROR: "データベース処理に失敗しました",
    EXTERNAL_SERVICE_ERROR: "外部サービスとの連携に失敗しました",
  },

  // リソース操作
  RESOURCE: {
    NOT_FOUND: "指定されたリソースが見つかりません",
    ALREADY_EXISTS: "既に存在します",
    CREATION_FAILED: "作成に失敗しました",
    UPDATE_FAILED: "更新に失敗しました",
    DELETE_FAILED: "削除に失敗しました",
  },

  // ビジネスロジック
  BUSINESS: {
    OPERATION_FAILED: "操作に失敗しました",
    INVALID_OPERATION: "この操作は実行できません",
    DUPLICATE_ENTRY: "重複したエントリーです",
  },
} as const;

/**
 * エラーレスポンスの型
 */
export type ErrorResponse = {
  error: string;
  errors?: Record<string, string>;
  retryAfter?: number;
};

/**
 * 標準的なエラーレスポンスを作成
 */
export function createErrorResponse(
  message: string,
  options?: {
    fields?: Record<string, string>;
    retryAfter?: number;
  },
): ErrorResponse {
  const response: ErrorResponse = {
    error: message,
  };

  if (options?.fields) {
    response.errors = options.fields;
  }

  if (options?.retryAfter) {
    response.retryAfter = options.retryAfter;
  }

  return response;
}

/**
 * エラーログを安全に出力（機密情報をサニタイズ）
 */
export function logError(
  context: string,
  error: unknown,
  additionalInfo?: Record<string, unknown>,
): void {
  const sanitizedError = sanitizeError(error);
  const sanitizedInfo = additionalInfo
    ? sanitizeLogData(additionalInfo)
    : undefined;

  console.error(`[${context}]`, sanitizedError, sanitizedInfo);
}

/**
 * エラーオブジェクトから機密情報を除去
 */
function sanitizeError(error: unknown): unknown {
  if (!error) return error;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      // スタックトレースは開発環境のみ
      ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
    };
  }

  if (typeof error === "object") {
    return sanitizeLogData(error as Record<string, unknown>);
  }

  return error;
}

/**
 * ログデータから機密情報をサニタイズ
 */
function sanitizeLogData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const sensitiveKeys = [
    "password",
    "token",
    "secret",
    "apiKey",
    "api_key",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "authorization",
    "cookie",
    "session",
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some((sensitive) =>
      lowerKey.includes(sensitive.toLowerCase()),
    );

    if (isSensitive) {
      sanitized[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeLogData(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
