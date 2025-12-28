# 問い合わせ自動送信ツール

Webサイトのお問い合わせフォームを自動的に見つけて、フォームに入力・送信するためのNext.jsアプリケーションです。

## 機能

- 🌐 指定したWebサイトに自動アクセス
- 🔍 お問い合わせページを自動検出（「お問い合わせ」「Contact」などのリンクを検索）
- 📝 フォームフィールドを自動識別して入力
  - 会社名、担当者名、お名前、メールアドレス、電話番号、件名、本文
- 🚀 フォームの自動送信
- 📊 実行ログのリアルタイム表示
- 🐛 デバッグモード（ブラウザを表示して動作確認可能）

## 技術スタック

- **Next.js 15** (App Router)
- **React 19**
- **TypeScript**
- **Playwright** (ブラウザ自動操作)
- **Tailwind CSS**

## セットアップ

### 必要な環境

- Node.js 18以上
- yarn または npm
- OpenAI APIキー（GPT-5系モデルが利用可能なプラン）

### インストール

```bash
# 依存関係のインストール
yarn install
# または
npm install

# Playwrightブラウザのインストール
npx playwright install chromium
```

### 環境変数

- `docs/env.example` を `.env.local` にコピーし、Supabase/Playwright/OpenAI などのキーを設定してください。
- 主要な環境変数
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_JWT_SECRET`
  - `PLAYWRIGHT_QUEUE_ID`, `PLAYWRIGHT_WORKER_URL`
  - `OPENAI_API_KEY`

### 開発サーバーの起動

```bash
yarn dev
# または
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

## 使い方

1. 対象サイトのURLを入力
2. 送信したい情報を入力（会社名、名前、メールアドレスなど）
3. 「開始」ボタンをクリック
4. 自動的にブラウザが起動し、フォームを検出・入力・送信します
5. ログで実行状況を確認できます

### デバッグモード

「ブラウザ表示 (デバッグ)」チェックボックスを有効にすると、実際のブラウザウィンドウが表示され、動作を確認できます。

## ビルド

```bash
yarn build
# または
npm run build
```

## 注意事項

- このツールは適切な用途でのみ使用してください
- スパムや迷惑行為に使用しないでください
- 各Webサイトの利用規約を確認してから使用してください
- 一部のWebサイトでは、自動化ツールによる送信が禁止されている場合があります

## SaaS版の追加要件（PDF/決済/メール）

- PDFアクセスとURLポリシー
  - PDFごと・受信者ごとに署名付きURLを発行（有効期限なし）。PDF削除時はURLを失効させ「削除済み」を表示。再アップロード時は新規URLを付与。
  - 閲覧前にメールアドレス入力を必須とし、ダウンロードは常に不可。OTPは不要。
- 決済/サブスクリプション（Stripe Checkout）
  - 会社単位の税込月額プランを 1/3/6/12 ヶ月で提供。トライアル1ヶ月（カード入力不要）。automatic_tax: off、税込価格を line_items に設定。
  - success: `/billing/success?session_id={CHECKOUT_SESSION_ID}`、cancel: `/billing/cancel`。Webhookで `subscriptions` テーブルと突合し、支払い完了後に自動アカウント発行＋メール通知。
- アカウント発行フロー（2パターン）
  - 管理画面で会社・メールを入力し招待メール送信。初回ログイン時にパスワード設定またはMagic Linkで active 化。
  - Stripe決済完了後、自動でアカウント作成し登録メールへ通知。期限切れ/キャンセル顧客はログイン不可。
- データモデル（詳細DDLは `docs/saas-schema.sql`）
  - `companies` / `accounts`（1社専属, invited→active）, `pdfs`（Storageパス・削除フラグ）, `pdf_send_logs`（受信者ごとトークン）, `pdf_open_events`（閲覧ログ）, `subscriptions`（Stripe）, `email_templates` / `email_events`（SES送信・開封ログ）, `company_contacts`, `audit_logs`。
  - すべて company_id を複合ユニーク/インデックスでスコープし、テナント分離を徹底。
- ログ保持とクレンジング
  - アクセスログ（IP/UserAgent）：90〜180日で削除または匿名化
  - 開封ログ：30〜90日
  - 監査ログ：1年
  - 定期ジョブで上記期間に沿ってクレンジングする

## 環境変数とスタブ運用

- `ENABLE_STRIPE=false` の場合、`/api/billing/checkout` はモックの session_id と URL を返すだけ（課金なし）。
- `ENABLE_SES=false` の場合、`/api/email/send` は送信せずログ出力のみ（messageIdはstub）。
- 本番接続時は Stripe/SES のキーを設定し、`ENABLE_STRIPE=true` / `ENABLE_SES=true` に切り替えて実装を有効化する。

### Stripe で必要な環境変数

- `ENABLE_STRIPE`（true/false）
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_3M` / `STRIPE_PRICE_ID_6M` / `STRIPE_PRICE_ID_12M`（各プランのPrice IDを設定。前払いの金額で作成する）
- `NEXT_PUBLIC_APP_URL`（success/cancel URL 生成に使用。未設定時は http://localhost:3000）

### SES で必要な環境変数

- `ENABLE_SES`（true/false）
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`（※本番接続時に使用する想定）

### ログクレンジング（定期ジョブ）

- スクリプト: `node scripts/cleanup-logs.mjs`
- 環境変数（デフォルト値）
  - `DRY_RUN=true`（削除せずログのみ）
  - `ACCESS_LOG_RETENTION_DAYS=180`
  - `OPEN_LOG_RETENTION_DAYS=90`
  - `AUDIT_LOG_RETENTION_DAYS=365`

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。
