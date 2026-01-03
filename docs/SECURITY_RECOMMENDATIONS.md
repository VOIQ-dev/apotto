# セキュリティ診断レポート

**診断日**: 2026-01-03
**対象**: contact-auto-submit アプリケーション

---

## エグゼクティブサマリー

このアプリケーションには、複数の重大なセキュリティ脆弱性が確認されました。特に**認証システムの根本的な欠陥**により、管理者権限への不正アクセスが極めて容易な状態です。本番環境へのデプロイ前に、最低限クリティカルレベルの脆弱性をすべて修正する必要があります。

---

## 🔴 クリティカル（Critical）- 即座に対応が必要

### 1. Backoffice 認証の重大な脆弱性

**場所**: `src/lib/backofficeAuth.ts:4-7`

**現状のコード**:

```typescript
export function isBackofficeAuthenticated(request: NextRequest): boolean {
  return request.cookies.get(BACKOFFICE_AUTH_COOKIE)?.value === "1";
}
```

**問題点**:

- Cookieの値が単純に "1" かどうかだけで管理者権限を判定
- 署名や暗号化がなく、誰でも簡単に偽造可能
- ブラウザのDevToolsで `document.cookie = "backoffice_auth=1"` を実行するだけで認証を突破できる

**影響度**: 🔥 **極めて高い** - 全ての管理者機能への不正アクセスが可能

**修正方法**:

#### オプション1: JWT ベースの認証（推奨）

```typescript
// lib/backofficeAuth.ts
import * as jose from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.BACKOFFICE_JWT_SECRET || "CHANGE_THIS_SECRET",
);

export async function createBackofficeAuthToken(
  username: string,
): Promise<string> {
  return await new jose.SignJWT({ username, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyBackofficeAuthToken(
  token: string,
): Promise<boolean> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export async function isBackofficeAuthenticated(
  request: NextRequest,
): Promise<boolean> {
  const token = request.cookies.get(BACKOFFICE_AUTH_COOKIE)?.value;
  if (!token) return false;
  return await verifyBackofficeAuthToken(token);
}
```

#### オプション2: Supabase Auth を使用（より推奨）

```typescript
// Backoffice用の専用テーブル (admin_users) を作成し、
// Supabase Authを使用して認証を行う
// 既存のユーザー認証システムと統合可能
```

---

### 2. デフォルト認証情報のハードコード

**場所**: `src/app/api/backoffice/auth/login/route.ts:14-19`

**現状のコード**:

```typescript
function getBackofficeCredentials() {
  const username =
    process.env.BACKOFFICE_USERNAME ||
    process.env.BACKOFFICE_USER ||
    "VOIQ-2025"; // ← 危険！
  const password = process.env.BACKOFFICE_PASSWORD || "VOIQ-2025"; // ← 危険！
  return { username, password };
}
```

**問題点**:

- 環境変数が未設定の場合、誰でも知り得るデフォルト値でログイン可能
- パスワードが平文で比較されている
- タイミング攻撃に脆弱

**影響度**: 🔥 **極めて高い** - 環境変数未設定の環境では即座に侵入可能

**修正方法**:

```typescript
import { compare } from "bcrypt";
import { timingSafeEqual } from "crypto";

function getBackofficeCredentials() {
  const username = process.env.BACKOFFICE_USERNAME;
  const passwordHash = process.env.BACKOFFICE_PASSWORD_HASH;

  if (!username || !passwordHash) {
    throw new Error(
      "BACKOFFICE_USERNAME と BACKOFFICE_PASSWORD_HASH を設定してください。" +
        "デフォルト値は削除されました。",
    );
  }

  return { username, passwordHash };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const inputUser = String(body.username ?? "").trim();
    const inputPass = String(body.password ?? "");

    if (!inputUser || !inputPass) {
      return NextResponse.json(
        { error: "username と password は必須です" },
        { status: 400 },
      );
    }

    const { username, passwordHash } = getBackofficeCredentials();

    // タイミング攻撃対策: ユーザー名も定数時間比較
    const usernameMatch = timingSafeEqual(
      Buffer.from(inputUser),
      Buffer.from(username.padEnd(inputUser.length)),
    );

    // bcryptで安全にパスワード検証
    const passwordMatch = await compare(inputPass, passwordHash);

    if (!usernameMatch || !passwordMatch) {
      return NextResponse.json(
        { error: "認証に失敗しました" },
        { status: 401 },
      );
    }

    // JWT トークンを発行
    const token = await createBackofficeAuthToken(username);
    const res = NextResponse.json({ success: true });
    setBackofficeAuthCookie(res, token);
    return res;
  } catch (err) {
    console.error("[backoffice/auth/login] Unexpected error", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
```

**パスワードハッシュの生成方法**:

```bash
# bcryptでハッシュを生成
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your-secure-password', 10, (err, hash) => console.log(hash));"
```

---

### 3. Legacy認証の脆弱性

**場所**: `src/middleware.ts:79`, `src/app/api/pdf/[token]/route.ts:83`

**現状のコード**:

```typescript
const isLegacyAuthenticated = request.cookies.get(AUTH_COOKIE)?.value === "1";
```

**問題点**: Backoffice認証と同様の脆弱性

**修正方法**:

- すべての Legacy認証を削除し、Supabase Auth に統一
- 既存の `apotto_auth` Cookie を使用している箇所を全て削除

---

### 4. タイミング攻撃への脆弱性

**場所**: パスワード比較を行う全ての箇所

**問題点**:

- 文字列比較が `!==` で行われており、比較時間によりパスワードの長さや一致度が推測可能

**修正方法**: 上記の bcrypt + timingSafeEqual を使用

---

## 🟠 高（High）- 早急な対応を推奨

### 5. SSRF（Server-Side Request Forgery）脆弱性

**場所**: `src/app/api/auto-submit/route.ts:15`, `src/lib/autoSubmit.ts:98-101`

**現状のコード**:

```typescript
// route.ts
if (!url || typeof url !== "string") {  // 型チェックのみ
  return new Response(...);
}

// autoSubmit.ts
function sanitizeUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}
```

**問題点**:

- ユーザーが任意のURLを指定可能
- 内部ネットワークへのアクセスを防いでいない
- クラウドメタデータエンドポイントへのアクセスが可能

**攻撃例**:

```json
{
  "url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
}
```

**影響度**: 🔥 **高い** - 内部サービスへの不正アクセス、AWS認証情報の漏洩

**修正方法**:

```typescript
// lib/urlValidator.ts
import { URL } from "url";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254", // AWS metadata
  "metadata.google.internal", // GCP metadata
]);

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^::1$/,
  /^fe80:/,
  /^fc00:/,
];

export function validateAndSanitizeUrl(url: string): string | null {
  try {
    // プロトコルを追加
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    const parsed = new URL(url);

    // HTTPSのみ許可（本番環境の場合）
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      return null;
    }

    // HTTPまたはHTTPSのみ許可
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase();

    // ブロックリストチェック
    if (BLOCKED_HOSTS.has(hostname)) {
      return null;
    }

    // プライベートIPチェック
    if (PRIVATE_IP_RANGES.some((regex) => regex.test(hostname))) {
      return null;
    }

    // 数値IPアドレスの場合、プライベート範囲をチェック
    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const octets = ipMatch.slice(1, 5).map(Number);
      if (
        octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168) ||
        octets[0] === 127 ||
        octets[0] === 0
      ) {
        return null;
      }
    }

    return parsed.toString();
  } catch {
    return null;
  }
}
```

**使用例**:

```typescript
// src/app/api/auto-submit/route.ts
import { validateAndSanitizeUrl } from "@/lib/urlValidator";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { url, ...rest } = body ?? {};

  const validatedUrl = validateAndSanitizeUrl(url);
  if (!validatedUrl) {
    return new Response(
      JSON.stringify({
        success: false,
        logs: ["Invalid or blocked URL"],
        note: "URLが無効、またはセキュリティポリシーにより禁止されています",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ... 続き
}
```

---

### 6. 入力バリデーション不足

**場所**: 全APIエンドポイント

**問題点**:

- `zod` が package.json に含まれているが使用されていない
- 基本的な型チェックのみで、フォーマット検証が不足

**修正方法**:

```typescript
// lib/schemas.ts
import { z } from "zod";

export const ContactFormSchema = z.object({
  formType: z.enum(["download", "demo"]),
  lastName: z.string().min(1, "姓を入力してください").max(50),
  firstName: z.string().min(1, "名を入力してください").max(50),
  companyName: z.string().min(1, "会社名を入力してください").max(200),
  department: z.string().max(100).optional(),
  position: z.string().max(100).optional(),
  email: z.string().email("有効なメールアドレスを入力してください"),
  phone: z
    .string()
    .regex(/^[\d-+() ]+$/, "有効な電話番号を入力してください")
    .optional(),
  howDidYouHear: z.string(),
  howDidYouHearOther: z.string().optional(),
});

export const LeadSchema = z.object({
  companyName: z.string().min(1).max(200),
  homepageUrl: z.string().url("有効なURLを入力してください"),
  contactName: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  title: z.string().max(100).optional(),
  email: z.string().email().optional(),
});

export const AutoSubmitSchema = z.object({
  url: z.string().min(1, "URLは必須です"),
  company: z.string().optional(),
  person: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email("有効なメールアドレスを入力してください").optional(),
  phone: z
    .string()
    .regex(/^[\d-+() ]+$/)
    .optional(),
  subject: z.string().optional(),
  message: z.string().optional(),
  debug: z.boolean().optional(),
});
```

**使用例**:

```typescript
// src/app/api/contact/route.ts
import { ContactFormSchema } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // Zodでバリデーション
    const validationResult = ContactFormSchema.safeParse(data);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: "入力内容にエラーがあります",
          errors: validationResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const validatedData = validationResult.data;

    // ... 続き（validatedData を使用）
  } catch (error) {
    // ...
  }
}
```

---

### 7. レート制限の欠如

**場所**: 全APIエンドポイント

**問題点**:

- API呼び出しに対するレート制限が実装されていない
- ブルートフォース攻撃やDDoS攻撃に脆弱

**影響度**: 🟠 **高い** - サービス拒否攻撃、リソース枯渇、認証情報の総当たり攻撃

**修正方法**:

#### オプション1: シンプルなインメモリレート制限

```typescript
// lib/rateLimit.ts
import { NextRequest } from "next/server";

type RateLimitConfig = {
  windowMs: number; // 時間窓（ミリ秒）
  maxRequests: number; // 最大リクエスト数
};

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(config: RateLimitConfig) {
  return (request: NextRequest): boolean => {
    const identifier = getClientIdentifier(request);
    const now = Date.now();
    const record = requestCounts.get(identifier);

    if (!record || now > record.resetAt) {
      requestCounts.set(identifier, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return true;
    }

    if (record.count >= config.maxRequests) {
      return false; // レート制限超過
    }

    record.count++;
    return true;
  };
}

function getClientIdentifier(request: NextRequest): string {
  // X-Forwarded-For を優先（プロキシ背後の場合）
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  // IPアドレスが取得できない場合はUser-Agentを使用（fallback）
  return request.headers.get("user-agent") || "unknown";
}

// 定期的にクリーンアップ（メモリリーク防止）
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (now > record.resetAt) {
      requestCounts.delete(key);
    }
  }
}, 60000); // 1分ごと
```

**使用例**:

```typescript
// src/app/api/auth/login/route.ts
import { rateLimit } from "@/lib/rateLimit";

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  maxRequests: 5, // 5回まで
});

export async function POST(request: NextRequest) {
  if (!loginRateLimit(request)) {
    return NextResponse.json(
      {
        error: "リクエストが多すぎます。しばらく待ってから再度お試しください。",
      },
      { status: 429 },
    );
  }

  // ... 続き
}
```

#### オプション2: Supabase を使用した分散レート制限（本番環境推奨）

```typescript
// lib/rateLimitDb.ts
import { createSupabaseServiceClient } from "./supabaseServer";

export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  const supabase = createSupabaseServiceClient();

  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { count } = await supabase
    .from("rate_limit_log")
    .select("*", { count: "exact", head: true })
    .eq("identifier", identifier)
    .eq("endpoint", endpoint)
    .gte("created_at", windowStart);

  if ((count || 0) >= maxRequests) {
    return false; // レート制限超過
  }

  // リクエストを記録
  await supabase.from("rate_limit_log").insert({
    identifier,
    endpoint,
    created_at: new Date().toISOString(),
  });

  return true;
}
```

**データベーステーブル作成**:

```sql
CREATE TABLE rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  INDEX idx_rate_limit_identifier_endpoint_created (identifier, endpoint, created_at)
);

-- 古いレコードを自動削除（1時間以上前）
CREATE OR REPLACE FUNCTION cleanup_rate_limit_log()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limit_log
  WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- 定期実行（pg_cron 拡張が必要）
SELECT cron.schedule('cleanup-rate-limit', '*/15 * * * *', 'SELECT cleanup_rate_limit_log();');
```

---

## 🟡 中（Medium）- 対応を推奨

### 8. XSS対策の不足

**推奨事項**:

- React のデフォルトエスケープに依存しているが、`dangerouslySetInnerHTML` を使用していないか確認
- ユーザー入力を表示する際は必ず適切にエスケープ
- Content Security Policy (CSP) ヘッダーを設定

```typescript
// next.config.js
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.jsでは必要
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co",
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};
```

---

### 9. エラーメッセージでの情報漏洩

**場所**: `src/app/api/auth/login/route.ts:86-91`

**現状のコード**:

```typescript
const msg = /email not confirmed/i.test(raw)
  ? "メールアドレスが未確認です（Email not confirmed）"
  : /invalid login credentials/i.test(raw)
    ? "メールアドレスまたはパスワードが正しくありません"
    : "ログインに失敗しました";
```

**問題点**:

- 「メールアドレスまたはパスワード」という表現により、メールアドレスの存在確認が可能
- ユーザー列挙攻撃に脆弱

**修正方法**:

```typescript
// すべてのログインエラーを統一
const msg = "ログイン情報が正しくありません";
```

---

### 10. ログに機密情報が含まれる可能性

**場所**: 42ファイルで126箇所の console.log/console.error

**問題点**:

- エラーログにユーザー入力やトークンが含まれる可能性
- 本番環境でログが適切にサニタイズされていない

**推奨事項**:

```typescript
// lib/logger.ts
type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "apiKey",
  "secret",
  "authorization",
  "cookie",
]);

function sanitizeObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object") {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function createLogger(namespace: string) {
  return {
    debug: (message: string, data?: unknown) => {
      if (process.env.NODE_ENV === "development") {
        console.debug(`[${namespace}] ${message}`, sanitizeObject(data));
      }
    },
    info: (message: string, data?: unknown) => {
      console.info(`[${namespace}] ${message}`, sanitizeObject(data));
    },
    warn: (message: string, data?: unknown) => {
      console.warn(`[${namespace}] ${message}`, sanitizeObject(data));
    },
    error: (message: string, error?: unknown) => {
      console.error(
        `[${namespace}] ${message}`,
        error instanceof Error ? error.message : sanitizeObject(error),
      );
    },
  };
}
```

**使用例**:

```typescript
// src/app/api/auth/login/route.ts
import { createLogger } from "@/lib/logger";

const logger = createLogger("auth:login");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    logger.info("Login attempt", { email: body.email }); // passwordはログに含まれない

    // ...
  } catch (err) {
    logger.error("Login failed", err);
    // ...
  }
}
```

---

## 📋 実装優先順位

### フェーズ1: 即座に実施（1-2日）

1. ✅ Backoffice 認証システムの完全再実装（JWT または Supabase Auth）
2. ✅ デフォルト認証情報の削除とbcryptハッシュ化
3. ✅ Legacy認証の削除
4. ✅ SSRF 対策の実装（URL検証）

### フェーズ2: 早急に実施（3-5日）

5. ✅ Zodを使用した全APIの入力バリデーション強化
6. ✅ レート制限の実装（認証エンドポイント優先）
7. ✅ タイミング攻撃対策

### フェーズ3: 推奨（1-2週間）

8. ✅ CSP ヘッダーの設定
9. ✅ エラーメッセージの統一
10. ✅ ログのサニタイゼーション
11. ✅ セキュリティヘッダーの追加
12. ✅ CORS 設定の見直し

---

## 🔍 追加の推奨事項

### 環境変数の管理

**.env.local は .gitignore に含まれています（✅ 良い）**

しかし、以下の点に注意:

- 本番環境では必ず環境変数を設定
- デフォルト値を含むサンプルファイル（`.env.example`）を作成
- 機密情報を含まないこと

```bash
# .env.example
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...

# Backoffice（必須: デフォルト値なし）
BACKOFFICE_USERNAME=admin
BACKOFFICE_PASSWORD_HASH=<bcrypt-hash>
BACKOFFICE_JWT_SECRET=<random-64-char-string>

# Stripe
ENABLE_STRIPE=true
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_3M=price_...
STRIPE_PRICE_ID_6M=price_...
STRIPE_PRICE_ID_12M=price_...

# Auto-submit worker
AUTO_SUBMIT_WORKER_URL=http://localhost:3001
```

### Secrets ローテーション

定期的に以下をローテーション:

- API キー（OpenAI, Stripe など）
- JWT シークレット
- データベース認証情報

### セキュリティ監査

- 定期的な脆弱性スキャン（Dependabot, Snyk など）
- ペネトレーションテストの実施
- セキュリティログの監視

### マルチテナント データ分離

現状、`company_id` でのフィルタリングは実装されていますが、以下を確認:

```typescript
// すべてのDBクエリで company_id を必須にする
// Row Level Security (RLS) を Supabase で有効化

-- Supabaseで RLS を設定
ALTER TABLE lead_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their company's leads"
  ON lead_lists
  FOR ALL
  USING (company_id = (SELECT company_id FROM accounts WHERE id = auth.uid()));
```

---

## 🧪 セキュリティテスト

### テストケース

1. **認証テスト**
   - [ ] Cookie偽造による不正アクセス
   - [ ] ブルートフォース攻撃
   - [ ] セッション固定攻撃
   - [ ] CSRF攻撃

2. **SSRF テスト**
   - [ ] 内部IP（127.0.0.1, localhost）へのアクセス
   - [ ] プライベートネットワーク（192.168.x.x）へのアクセス
   - [ ] クラウドメタデータエンドポイント（169.254.169.254）
   - [ ] ファイルプロトコル（file://）

3. **インジェクションテスト**
   - [ ] SQL インジェクション（Supabaseは保護されているが確認）
   - [ ] XSS（ユーザー入力の表示箇所）
   - [ ] コマンドインジェクション

4. **データアクセステスト**
   - [ ] 他社のデータへのアクセス（company_id の漏洩）
   - [ ] 権限昇格（member → admin）

---

## 📚 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security Best Practices](https://nextjs.org/docs/advanced-features/security-headers)
- [Supabase Security](https://supabase.com/docs/guides/auth/row-level-security)
- [SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

---

**診断担当**: Claude Code
**次回診断推奨日**: 2026-02-03（修正完了後）
