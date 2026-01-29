# セッション検証による強制ログアウト問題

## 問題の概要

送信処理中に突然ログアウトされる問題が発生していました。

## 原因

同時ログイン制限機能により、以下のフローで厳密なセッション検証が行われていました:

### 実装の仕組み

1. **ログイン時** (`src/app/api/auth/login/route.ts`)
   - 新しいセッションID（UUID）を生成
   - DBの`accounts.current_session_id`に保存
   - Cookieに`apotto_session_id`を設定（有効期限: 7日間）

2. **API呼び出し時** (`src/lib/routeAuth.ts`)
   - `getAccountContextFromRequest()`でセッション検証
   - CookieのセッションIDとDBのセッションIDを比較
   - 不一致の場合 → `SESSION_INVALID`エラー（401）

3. **フロントエンド** (`src/hooks/useSessionValidation.ts`)
   - `SESSION_INVALID`エラーを検知
   - 自動的にログアウトAPIを呼び出し
   - `/login?reason=session_invalid`にリダイレクト

### なぜ送信処理中にログアウトされるのか？

以下のいずれかの原因が考えられます:

1. **Cookieが正しく送信されていない**
   - ブラウザの設定でCookieがブロックされている
   - CORS設定の問題
   - `SameSite`属性の問題

2. **Cookie の期限切れ**
   - 長時間処理（送信処理）中にCookieが期限切れになる可能性は低い（7日間有効）
   - ただし、ブラウザのセッションストレージがクリアされた可能性

3. **実際に別の場所でログインした**
   - 別のタブ、ブラウザ、デバイスで同じアカウントにログイン
   - その場合、新しいセッションIDがDBに保存され、既存のセッションが無効化される

## 修正内容

### 1. セッション検証を環境変数で制御可能に

`src/lib/routeAuth.ts`を修正し、環境変数`ENABLE_SESSION_CHECK`でセッション検証を無効化できるようにしました:

```typescript
// セッションID検証（同時ログイン制限）
// 環境変数でセッション検証を無効化できるようにする
const sessionCheckEnabled = process.env.ENABLE_SESSION_CHECK !== "false";

const cookieSessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
const dbSessionId = account?.current_session_id;

// DBにセッションIDがない場合（マイグレーション前）は検証をスキップ
// または環境変数でセッション検証が無効化されている場合もスキップ
const sessionValid =
  !sessionCheckEnabled || !dbSessionId || cookieSessionId === dbSessionId;
```

### 2. 環境変数の追加

`.env`または Vercel の環境変数に以下を追加:

```bash
# セッション検証を無効化する場合
ENABLE_SESSION_CHECK=false

# セッション検証を有効にする場合（デフォルト）
ENABLE_SESSION_CHECK=true
```

## 対処方法

### 一時的な対処（すぐに問題を解決したい場合）

環境変数に`ENABLE_SESSION_CHECK=false`を設定してセッション検証を無効化してください。

**Vercel での設定方法:**

1. Vercel ダッシュボードを開く
2. プロジェクト → Settings → Environment Variables
3. `ENABLE_SESSION_CHECK`を`false`に設定
4. デプロイし直す

### 根本的な対処（推奨）

以下を確認してください:

1. **ブラウザの開発者ツールで確認**
   - Application → Cookies で`apotto_session_id`が存在するか
   - Network タブで API リクエスト時に Cookie が送信されているか

2. **複数のタブ/ブラウザで同時ログインしていないか確認**
   - 同じアカウントで別の場所からログインすると、既存のセッションが無効化されます
   - ログアウト後、再度ログインしてから送信処理を試してください

3. **ブラウザのCookie設定を確認**
   - Cookie がブロックされていないか
   - サードパーティCookieの設定（ただし、同一ドメインなので通常は問題なし）

4. **コンソールログを確認**
   - サーバー側のログで`[routeAuth] Session mismatch detected`が出力されているか
   - 出力されている場合、Cookie と DB のセッションIDの不一致が確認できます

## 今後の改善案

1. **セッションリフレッシュ機能の追加**
   - 長時間のAPI処理中でも、セッションを自動的に延長する仕組み

2. **より柔軟なセッション管理**
   - 複数デバイスでの同時ログインを許可するオプション
   - デバイスごとのセッション管理（最大N個のセッションを許可）

3. **ユーザー通知の改善**
   - ログアウト時に「別の場所でログインされました」というメッセージを明確に表示
   - どのデバイスでログインしているか確認できる機能

## 関連ファイル

- `src/lib/routeAuth.ts` - セッション検証ロジック
- `src/lib/sessionConfig.ts` - セッションCookie設定
- `src/hooks/useSessionValidation.ts` - フロントエンドのセッション検証
- `src/app/api/auth/login/route.ts` - ログイン時のセッションID生成
- `docs/migrations/add_current_session_id.sql` - セッションID機能追加のマイグレーション
