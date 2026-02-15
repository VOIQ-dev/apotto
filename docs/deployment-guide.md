# 本番環境構築手順書

最終更新: 2026-02-06

## 📋 目次

1. [前提条件](#前提条件)
2. [Supabaseセットアップ](#supabaseセットアップ)
3. [GitHubリポジトリ設定](#githubリポジトリ設定)
4. [Vercelデプロイ](#vercelデプロイ)
5. [Railwayデプロイ](#railwayデプロイ)
6. [動作確認](#動作確認)
7. [トラブルシューティング](#トラブルシューティング)

---

## 前提条件

### 必要なアカウント

以下のサービスアカウントを事前に準備してください：

- ✅ GitHub アカウント
- ✅ Vercel アカウント（GitHubと連携推奨）
- ✅ Railway アカウント（GitHubと連携推奨）
- ✅ Supabase アカウント
- ✅ OpenAI アカウント（APIキー取得済み）
- ✅ Slack Workspace（通知用、オプション）

### ローカル開発環境

- Node.js 18以上
- yarn または npm
- Git

---

## Supabaseセットアップ

### 1. 新規プロジェクト作成

1. https://supabase.com/ にアクセス
2. 「Start your project」をクリック
3. 組織を選択または作成
4. プロジェクト情報を入力：
   - **Name**: `apotto-production`（任意）
   - **Database Password**: 強力なパスワードを生成・保存
   - **Region**: `Northeast Asia (Tokyo)`（推奨）
5. 「Create new project」をクリック

### 2. データベーススキーマ作成

プロジェクト作成完了後：

1. Supabase ダッシュボード > SQL Editor
2. 以下のスキーマファイルを順番に実行：

```bash
# ローカルでスキーマファイルを確認
ls docs/*.sql
```

実行順序：

1. `docs/saas-schema.sql` - 基本テーブル
2. `docs/contact-schema.sql` - コンタクト関連
3. `docs/pdf-schema.sql` - PDF管理
4. `docs/migrations/add_current_session_id.sql` - セッション追加
5. `docs/migrations/add_view_tracking.sql` - 閲覧追跡

**実行方法:**

- SQL Editorにコピー&ペースト
- 「Run」をクリック
- エラーが出ないことを確認

### 3. Storageバケット作成

1. Supabase ダッシュボード > Storage
2. 「New bucket」をクリック
3. バケット情報を入力：
   - **Name**: `pdfs`
   - **Public**: ❌（チェックしない）
   - **File size limit**: `50MB`（任意）
4. 「Create bucket」をクリック

### 4. API Keys取得

1. Supabase ダッシュボード > Project Settings > API
2. 以下をメモ帳などに保存：
   - **Project URL**: `https://xxx.supabase.co`
   - **anon public**: `eyJhbG...`（公開キー）
   - **service_role**: `eyJhbG...`（秘密キー、⚠️厳重管理）

3. Project Settings > Database > Connection string
   - **JWT Secret**をコピー

### 5. バックアップ設定（推奨）

1. Supabase ダッシュボード > Project Settings > Database
2. **Point in Time Recovery (PITR)** を有効化
   - 注意: 有料プラン（Pro以上）が必要
3. 自動バックアップスケジュールを確認

---

## GitHubリポジトリ設定

### 1. リポジトリクローン

```bash
# HTTPSでクローン
git clone https://github.com/VOIQ-dev/apotto.git
cd apotto

# または SSHでクローン
git clone git@github.com:VOIQ-dev/apotto.git
cd apotto
```

### 2. 依存パッケージインストール

```bash
# ルートディレクトリ
yarn install

# Railwayワーカー（server）
cd server
yarn install
npx playwright install chromium
cd ..
```

### 3. ローカル環境変数設定

```bash
# .env.local ファイルを作成
cp docs/env.example .env.local

# エディタで開いて設定
# Supabaseで取得した情報を入力
```

**`.env.local` の設定内容:**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...（anonキー）
SUPABASE_SERVICE_ROLE_KEY=eyJ...（service_roleキー）
SUPABASE_JWT_SECRET=xxx（JWTシークレット）
NEXT_PUBLIC_BASE_URL=http://localhost:3000
OPENAI_API_KEY=sk-...（OpenAI APIキー）
SLACK_WEBHOOK_URL=https://hooks.slack.com/...（任意）
```

### 4. ローカル動作確認

```bash
# 開発サーバー起動
yarn dev

# ブラウザで確認
open http://localhost:3000
```

### 5. ブランチ保護設定（推奨）

1. GitHub > リポジトリ > Settings > Branches
2. 「Add branch protection rule」
3. **Branch name pattern**: `master`
4. 設定項目：
   - ✅ Require pull request before merging
   - ✅ Require approvals (1 approval)
   - ✅ Dismiss stale pull request approvals
   - ✅ Require status checks to pass

---

## Vercelデプロイ

### 1. Vercelプロジェクト作成

1. https://vercel.com/ にアクセス
2. 「Add New」> 「Project」
3. GitHubリポジトリをインポート：
   - **Repository**: `VOIQ-dev/apotto`
   - 「Import」をクリック

### 2. プロジェクト設定

#### Build & Development Settings

- **Framework Preset**: Next.js
- **Root Directory**: `./`（デフォルト）
- **Build Command**: `yarn build`
- **Output Directory**: `.next`（デフォルト）
- **Install Command**: `yarn install`

#### 環境変数設定

「Environment Variables」セクションで以下を追加：

| Name                            | Value                                     | Environment |
| ------------------------------- | ----------------------------------------- | ----------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabaseプロジェクト URL                  | Production  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon キー                        | Production  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service_role キー                | Production  |
| `SUPABASE_JWT_SECRET`           | Supabase JWT シークレット                 | Production  |
| `NEXT_PUBLIC_BASE_URL`          | `https://your-app.vercel.app`（後で更新） | Production  |
| `OPENAI_API_KEY`                | OpenAI APIキー                            | Production  |
| `SLACK_WEBHOOK_URL`             | Slack Webhook URL（任意）                 | Production  |

※ Preview/Developmentにもコピーすることを推奨

### 3. デプロイ実行

1. 「Deploy」ボタンをクリック
2. デプロイ完了を待つ（数分）
3. デプロイURLを確認：`https://apotto-chi.vercel.app`

### 4. カスタムドメイン設定（オプション）

1. Vercel プロジェクト > Settings > Domains
2. カスタムドメインを追加
3. DNSレコードを設定（Vercelの指示に従う）

### 5. `NEXT_PUBLIC_BASE_URL` の更新

1. Vercel > Settings > Environment Variables
2. `NEXT_PUBLIC_BASE_URL` を実際のURLに更新
   - 例: `https://apotto-chi.vercel.app`
3. 「Redeploy」で再デプロイ

---

## Chrome拡張機能のデプロイ

### 前提条件

Chrome拡張機能は**フォーム自動送信機能に必須**です。以下の2つの方法でデプロイできます。

### 方法A: Chrome Web Storeに公開（推奨・本番環境）

**メリット**:

- 全ユーザー共通のExtension ID
- 自動更新機能
- プロフェッショナルな配布方法

#### 1. Chrome Web Store Developer登録

1. https://chrome.google.com/webstore/devconsole/ にアクセス
2. Googleアカウントでログイン
3. 開発者登録料（$5）を支払う

#### 2. 拡張機能のビルドとZIP作成

```bash
cd chrome-extension
yarn install
yarn build
zip -r apotto-extension.zip dist/
```

#### 3. Chrome Web Storeにアップロード

1. Developer Dashboardで「新しいアイテム」をクリック
2. `apotto-extension.zip`をアップロード
3. ストア情報を入力：
   - **名前**: apotto
   - **説明**: AI営業フォーム自動送信ツール
   - **カテゴリ**: 生産性
   - **言語**: 日本語
   - **アイコン**: 既にZIPに含まれている
   - **スクリーンショット**: 最低1枚（1280x800px または 640x400px）

4. **プライバシー設定**:
   - プライバシーポリシーURL: `https://apotto.jp/privacy-policy`
   - データ収集の開示（必須）

5. **権限の説明**:
   - `<all_urls>`: 企業の問い合わせフォームにアクセスするために必要
   - `tabs`: フォーム送信のためにタブを管理
   - `storage`: 並行タブ数などの設定を保存

6. 「Submit for review」をクリック

#### 4. 審査と公開

- 審査期間: 通常1-3日
- 審査結果はメールで通知される
- 承認後、Extension IDが発行される（全ユーザー共通）

#### 5. Extension IDをVercelに設定

1. Chrome Web Store > 公開された拡張機能 > Extension ID をコピー
2. Vercel > Settings > Environment Variables
3. 以下を追加：
   - Name: `NEXT_PUBLIC_CHROME_EXTENSION_ID`
   - Value: コピーしたExtension ID
   - Environment: Production
4. 「Save」をクリック
5. 「Redeploy」で再デプロイ

### 方法B: 開発版として直接配布（開発・テスト環境）

**メリット**:

- 審査不要
- 即座に配布可能

**デメリット**:

- ユーザーごとに異なるExtension ID（環境変数で管理不可）
- 自動更新なし
- 手動インストールが必要

#### 配布手順

1. `apotto-extension.zip`をユーザーに配布
2. ユーザーに以下の手順を案内：
   - `chrome://extensions`を開く
   - 「デベロッパーモード」をON
   - 「パッケージ化されていない拡張機能を読み込む」
   - ZIPを解凍した`dist`フォルダを選択

#### 注意事項

- 開発版のExtension IDはユーザーごとに異なるため、環境変数での一元管理はできません
- 本番環境では**方法A（Chrome Web Store公開）を強く推奨**

---

## Railwayデプロイ

**注意**: RailwayのPlaywrightワーカーは現在使用されていません（Chrome拡張機能に移行済み）。
将来的に予約送信機能を実装する場合に使用します。

### 1. Railwayプロジェクト作成

1. https://railway.app/ にアクセス
2. 「New Project」をクリック
3. 「Deploy from GitHub repo」を選択
4. リポジトリを選択：`VOIQ-dev/apotto`

### 2. サービス設定

自動的にサービスが作成されます。設定を確認・変更：

1. サービスをクリック > Settings
2. 以下を設定：

#### Build Settings

- **Root Directory**: `server`
- **Build Command**: `yarn install && yarn build`
- **Start Command**: `node dist/index.js`

#### Environment Variables

「Variables」タブで以下を追加：

| Variable          | Value                                         |
| ----------------- | --------------------------------------------- |
| `PORT`            | `3001`（Railwayが自動設定する場合は不要）     |
| `ALLOWED_ORIGINS` | `https://apotto-chi.vercel.app`（Vercel URL） |

### 3. デプロイ確認

1. Deployments タブで進捗確認
2. デプロイ完了後、URLを取得：
   - Settings > Networking > Generate Domain
   - 例: `https://auto-submit-worker-xxx.up.railway.app`

### 4. ヘルスチェック

```bash
curl https://your-railway-app.up.railway.app/health
```

期待されるレスポンス:

```json
{
  "status": "ok",
  "timestamp": "2026-01-17T00:00:00.000Z"
}
```

### 5. Vercelに Railway URLを設定

1. Vercel > Settings > Environment Variables
2. `AUTO_SUBMIT_WORKER_URL` を追加/更新
   - Value: `https://your-railway-app.up.railway.app`
3. 「Redeploy」で再デプロイ

---

## 動作確認

### 1. フロントエンド確認

1. Vercel URLにアクセス: https://apotto-chi.vercel.app
2. ログインページが表示されることを確認
3. テストアカウントでログイン（事前にSupabaseで作成）

### 2. API動作確認

#### ヘルスチェック

```bash
# Vercel（Next.js API）
curl https://apotto-chi.vercel.app/api/health

# Railway（Playwright Worker）
curl https://your-railway-app.up.railway.app/health
```

#### AI営業メール生成

```bash
curl -X POST https://apotto-chi.vercel.app/api/ai/sales-copy \
  -H "Content-Type: application/json" \
  -d '{
    "sender": {
      "companyName": "VOIQ株式会社",
      "fullName": "山田太郎",
      "email": "test@voiq.jp",
      "subject": "営業のご提案"
    },
    "recipient": {
      "homepageUrl": "https://example.com"
    }
  }'
```

### 3. データベース接続確認

1. Supabase ダッシュボード > Table Editor
2. テーブルが作成されていることを確認
3. サンプルデータを挿入してみる

### 4. フォーム送信テスト

1. アプリケーションからテストフォーム送信を実行
2. Railway ログでPlaywright実行ログを確認
3. 成功/失敗が正しく記録されることを確認

---

## トラブルシューティング

### Vercelデプロイエラー

#### 症状: ビルドエラー

```
Error: Cannot find module 'xxx'
```

**対処法:**

1. `package.json` に依存関係が正しく記載されているか確認
2. ローカルで `yarn build` を実行して再現確認
3. `node_modules` と `yarn.lock` をコミット（`yarn.lock`のみ）

#### 症状: 環境変数が読み込めない

```
Error: NEXT_PUBLIC_SUPABASE_URL is not defined
```

**対処法:**

1. Vercel > Settings > Environment Variables を確認
2. 環境変数が「Production」に設定されているか確認
3. 再デプロイを実行

### Railwayデプロイエラー

#### 症状: ブラウザ起動エラー

```
Error: Failed to launch chromium
```

**対処法:**

1. `server/package.json` でPlaywrightバージョン確認
2. Dockerfile があれば、必要な依存関係を追加：
   ```dockerfile
   RUN apt-get update && apt-get install -y \
       libnss3 \
       libnspr4 \
       libatk1.0-0 \
       libatk-bridge2.0-0
   ```

#### 症状: メモリ不足

```
Error: Out of memory
```

**対処法:**

1. Railway > Settings > Resources
2. メモリを1GB以上に増やす
3. 必要に応じてプランをアップグレード

### Supabase接続エラー

#### 症状: データベース接続失敗

```
Error: Connection refused
```

**対処法:**

1. Supabase プロジェクトが起動しているか確認
2. APIキーが正しいか確認（anon vs service_role）
3. ネットワークファイアウォール設定を確認

#### 症状: 認証エラー

```
Error: JWT token is invalid
```

**対処法:**

1. `SUPABASE_JWT_SECRET` が正しく設定されているか確認
2. Supabase ダッシュボードで最新のJWT Secretを取得
3. 環境変数を更新して再デプロイ

---

## 初回デプロイチェックリスト

デプロイ完了後、以下を確認してください：

### Supabase

- [ ] プロジェクトが作成されている
- [ ] データベーススキーマが適用されている
- [ ] Storageバケット（pdfs）が作成されている
- [ ] バックアップ設定が有効（PITRまたは手動）

### GitHub

- [ ] リポジトリがクローンできる
- [ ] ブランチ保護が設定されている（推奨）
- [ ] 必要なメンバーに権限が付与されている

### Vercel

- [ ] プロジェクトがデプロイされている
- [ ] 本番URLにアクセスできる
- [ ] 環境変数がすべて設定されている
- [ ] カスタムドメインが設定されている（オプション）

### Railway

- [ ] サービスがデプロイされている
- [ ] ヘルスチェックが成功する
- [ ] Vercelから接続できる（CORS設定済み）
- [ ] メモリが十分確保されている

### 動作確認

- [ ] ログイン/ログアウトができる
- [ ] Chrome拡張機能が接続できる（「✓ Chrome拡張機能に接続中」と表示）
- [ ] リードのCSVインポートができる
- [ ] AI文言生成が動作する
- [ ] 並行タブ数の設定ができる（1-5から選択）
- [ ] フォーム自動送信が動作する（Chrome拡張機能経由）
- [ ] 送信結果がリード表に反映される
- [ ] 送信回数と最終送信日が更新される
- [ ] PDF管理機能が動作する
- [ ] ダッシュボードが表示される

---

## 次のステップ

デプロイ完了後、以下を実施してください：

1. **監視設定**
   - [ ] Sentry等のエラー監視ツール導入
   - [ ] アラート設定（Slack通知等）
   - [ ] 稼働監視（Better Uptime等）

2. **セキュリティ強化**
   - [ ] Supabase RLS（Row Level Security）有効化
   - [ ] 環境変数の定期ローテーション
   - [ ] アクセスログの監視

3. **パフォーマンス最適化**
   - [ ] Vercel Analytics 有効化
   - [ ] Railway メモリ・CPU使用状況監視
   - [ ] データベースインデックス最適化

4. **ドキュメント整備**
   - [ ] 運用手順書の確認・更新
   - [ ] 障害対応マニュアル作成
   - [ ] ユーザーマニュアル作成

---

## 関連ドキュメント

- [README.md](../README.md) - プロジェクト概要
- [operations-manual.md](./operations-manual.md) - 運用手順書
- [env.example](./env.example) - 環境変数サンプル
- [saas-schema.sql](./saas-schema.sql) - データベーススキーマ

---

## 改訂履歴

| 日付       | バージョン | 変更内容 | 担当者       |
| ---------- | ---------- | -------- | ------------ |
| 2026-01-17 | 1.0.0      | 初版作成 | AI Assistant |
