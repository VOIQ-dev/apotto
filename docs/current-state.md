## 現状まとめ（DB / 実装）

最終更新: 2025-12-14

### DB: いま存在しているテーブル（あなたの現状認識）

- `pdfs`
- `pdf_send_logs`
- `pdf_open_events`
- `pdf_daily_metrics`
- `companies`
- `accounts`
- `subscriptions`
- `email_templates`
- `email_events`
- `company_contacts`
- `audit_logs`

### DB: 追加で導入済み（SaaS想定）

- `companies`
- `accounts`
- `subscriptions`
- `email_templates`
- `email_events`
- `company_contacts`
- `audit_logs`

---

### DB: テーブル概要（現状スコープ）

#### `pdfs`

- **用途**: PDF本体（Storage）のメタ情報
- **主なカラム**: `id`, `original_filename`, `storage_path`, `size_bytes`, `is_deleted`, `created_at`
- **参照/更新**:
  - 一覧表示、署名URL生成
  - 削除（`is_deleted` 更新）

#### `pdf_send_logs`

- **用途**: 送信（=分母）と、企業別トークン（`token`）の管理
- **主なカラム**: `id`, `pdf_id`, `token`, `recipient_company_name`, `recipient_homepage_url`, `recipient_email`, `sent_at`, `first_opened_at`, `is_revoked`
- **参照/更新**:
  - `token` からPDFを引く
  - 初回閲覧時に `first_opened_at` をセット

#### `pdf_open_events`

- **用途**: 閲覧イベント（閲覧者メール単位で集約）
- **主なカラム**: `pdf_send_log_id`, `pdf_id`, `viewer_email`, `opened_at`, `last_seen_at`, `read_percentage_max`, `max_page_reached`, `elapsed_seconds_max`, `ip_address`, `user_agent`, `referrer`
- **備考**: `(pdf_send_log_id, viewer_email)` をキーに upsert する前提

#### `pdf_daily_metrics`

- **用途**: 日次集計（送信数/閲覧数）
- **主なカラム**: `day`, `pdf_id`, `sent_count`, `opened_count`
- **備考**: `increment_pdf_daily_metrics(day, pdf_id, sent_delta, opened_delta)` RPC を優先使用

---

### 実装: API/ページ ↔ テーブル対応

#### PDF管理

- **`GET /api/pdf/list`** (`src/app/api/pdf/list/route.ts`)
  - `pdfs` を取得し、Storage の署名URLを付与
- **`POST /api/pdf/upload`** (`src/app/api/pdf/upload/route.ts`)
  - Storageへアップロード + `pdfs` にINSERT
- **`DELETE /api/pdf/by-id/[id]`** (`src/app/api/pdf/by-id/[id]/route.ts`)
  - `pdfs.is_deleted=true` に更新
  - `pdf_send_logs` を `is_revoked=true` に更新（対象pdf_id）

#### トークン閲覧

- **`POST /api/pdf/[token]/open`** (`src/app/api/pdf/[token]/open/route.ts`)
  - `pdf_send_logs` を `token` で取得（`pdfs` を埋め込み）
  - `pdf_open_events` に upsert（閲覧者メール単位）
  - `pdf_send_logs.first_opened_at` を初回のみ更新
  - 条件付きで `pdf_daily_metrics.opened_count` をインクリメント
  - Storage の署名URLを返す
- **`POST /api/pdf/[token]/progress`** (`src/app/api/pdf/[token]/progress/route.ts`)
  - `pdf_send_logs` を `token` で取得（`pdfs` を埋め込み）
  - `pdf_open_events` の `read_percentage_max/max_page_reached/elapsed_seconds_max` を max 維持で upsert

#### 送信ログ（分母）登録

- **`POST /api/pdf/send-log`** (`src/app/api/pdf/send-log/route.ts`)
  - `pdf_send_logs` にINSERT（複数件可）
  - `pdf_daily_metrics.sent_count` を日次でまとめてインクリメント

#### ダッシュボード（分析）

- **`GET /api/dashboard/metrics`** (`src/app/api/dashboard/metrics/route.ts`)
  - `pdf_daily_metrics` から送信/閲覧を集計
  - `pdf_open_events` から閲覧ログ・完読率・滞在時間等を集計
  - `pdf_send_logs` から企業名マッピング、会社フィルタ時の送信/閲覧数算出
  - `pdfs` からPDF名を取得
  - UI用 `options: { pdfs, companies }` を返す
- **`/dashboard`** (`src/app/dashboard/page.tsx`)
  - `/api/dashboard/metrics` を呼び、期間/PDF/企業フィルタ + 各チャート表示
  - `industryEngagement` が空のときは空状態を表示（落ちないように）

---

### 重要: 会社スコープ（マルチテナント）要件に対する現状

結論: **現状は未達（ほぼ未対応）**

- **全INSERTで `company_id` を必ず入れる**
  - `pdfs` / `pdf_send_logs` / `pdf_open_events` で `company_id` を確実に入れる実装になっていない箇所がある
- **全SELECT/UPDATE/DELETEで `company_id` で必ず絞る**
  - `pdfs` 一覧、ダッシュボード集計、削除系などが `company_id` 絞り込み無し
- **RLSを有効化して会社スコープを強制**
  - DB側のRLS/policyをまだ整備していない
  - さらに service role を使うAPIはRLSが効かないため、コード側 `company_id` 絞り込みが必須

（このファイルは「現状の整理」用途。会社スコープ対応の実装は別途タスク化して進める。）
