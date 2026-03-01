# apotto - AI営業フォーム自動送信システム

企業の問い合わせフォームを自動検出し、AIが生成したパーソナライズされた営業文面を自動送信するNext.jsアプリケーションです。

## 機能

- **AI文面生成**: GPT-5-miniによる企業ごとのパーソナライズされた問い合わせ文言の自動生成（最大5件同時生成）
- **フォーム自動検出**: スコアリング方式によるお問い合わせフォームの高精度自動検出
- **フォーム自動入力**: 会社名、担当者名（姓名分割対応）、ふりがな（ひらがな/カタカナ自動判定）、メール（確認用含む）、電話番号（分割入力対応）、住所（郵便番号・都道府県・市区町村・番地）
- **Chrome拡張機能による自動送信**: 1〜10並行処理対応、確認画面の自動処理
- **実行ログ**: リアルタイム進捗表示、送信結果の自動記録
- **ページ除外**: 採用・IR・資料請求ページの自動除外、CAPTCHA検出
- **PDF資料添付**: 開封トラッキング付きPDFリンクの自動挿入
- **AIチャットボット**: システムの使い方をサポート

## 技術スタック

- **Next.js 15** (App Router)
- **React 19**
- **TypeScript**
- **Chrome拡張機能** (フォーム自動送信)
- **OpenAI GPT-5-mini** (AI文面生成・チャットボット)
- **Jina AI Reader** (Webクローリング、タイムアウト30秒)
- **Supabase** (認証・DB・Storage)
- **Tailwind CSS**

## セットアップ

### 必要な環境

- Node.js 18以上
- yarn
- OpenAI APIキー（GPT-5系モデルが利用可能なプラン）
- Chrome ブラウザ（拡張機能用）

### インストール

```bash
# 依存関係のインストール
yarn install

# Chrome拡張機能のビルド
cd chrome-extension && yarn install && yarn build && cd ..
```

### 環境変数

- `docs/env.example` を `.env.local` にコピーし、各サービスのキーを設定してください。
- 主要な環境変数
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_JWT_SECRET`
  - `OPENAI_API_KEY`
  - `OPENAI_SALES_MODEL`（デフォルト: gpt-5-mini）
  - `NEXT_PUBLIC_CHROME_EXTENSION_ID`

### 開発サーバーの起動

```bash
yarn dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

### Chrome拡張機能のインストール

1. Chrome で `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」で `chrome-extension/dist` を指定

## 使い方

1. Chrome拡張機能をインストール（「✓ Chrome拡張機能に接続中」を確認）
2. 送信者情報を設定（会社名、姓名、ふりがな、メール、電話番号、住所等）
3. CSV/ExcelファイルでリードをインポートRender（必須: 企業名、ホームページURL）
4. リードを選択して「文言生成」→ AIが企業HPをクローリング・分析して文面を自動生成
5. 同時送信数を設定し、「一括送信」→ Chrome拡張機能が並行処理
6. 全件完了後、リード表に結果が自動反映

## ビルド

```bash
yarn build
```

## ドキュメント一覧

| カテゴリ                 | ファイル                                              | 内容                                                |
| ------------------------ | ----------------------------------------------------- | --------------------------------------------------- |
| **要件**                 | `docs/requirements.md`                                | 機能要件・アーキテクチャ仕様                        |
| **API仕様**              | `docs/api-sales-copy-specification.md`                | 営業文面生成APIのエンドポイント・パラメータ仕様     |
| **API操作**              | `docs/api-sales-copy-usage.md`                        | API使用例・トラブルシューティング                   |
| **本番構築**             | `docs/deployment-guide.md`                            | Supabase/Vercelデプロイ手順                         |
| **運用手順**             | `docs/operations-manual.md`                           | ログ確認・障害対応・環境変数設定                    |
| **テストチェックリスト** | `docs/test-checklist.md`                              | デプロイ前・機能修正後の確認項目                    |
| **Chrome拡張テスト仕様** | `docs/test-specifications/chrome-extension-test.md`   | フォーム自動送信・並行処理・CAPTCHA検出のテスト仕様 |
| **単体テスト仕様**       | `docs/test-specifications/unit-test-specification.md` | ユニットテスト仕様                                  |
| **負荷・耐久テスト仕様** | `docs/test-specifications/load-and-endurance-test.md` | 負荷テスト仕様                                      |
| **コーディング規約**     | `docs/coding-convention.md`                           | TypeScript/Next.jsコーディングルール                |
| **コミット規約**         | `docs/commit-convention.md`                           | Gitコミットメッセージ規約                           |
| **ER図**                 | `docs/er-diagram.md`                                  | データベース構成                                    |

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
