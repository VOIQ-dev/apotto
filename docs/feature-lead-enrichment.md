# リード情報エンリッチメント機能 仕様書

最終更新: 2026-01-17

## 📋 概要

既存のリード情報に対して、スクレイピングとAI分析を活用して企業情報を自動収集・分類し、業界ごとに整理する機能。

---

## ✅ 実現可能性: 95%

### 既存機能の活用

以下の機能は**既に実装済み**です：

| 機能           | 実装状況 | ファイル                          |
| -------------- | -------- | --------------------------------- |
| リード管理     | ✅ 完了  | `src/app/api/leads/route.ts`      |
| スクレイピング | ✅ 完了  | `src/lib/crawler.ts`              |
| AI分析         | ✅ 完了  | `src/lib/openaiClient.ts`         |
| CSVインポート  | ✅ 完了  | `src/app/api/leads/route.ts`      |
| バッチ処理     | ✅ 完了  | `src/app/api/leads/bulk/route.ts` |

### 追加が必要な機能

| 機能                      | 実装難易度 | 見積工数 |
| ------------------------- | ---------- | -------- |
| 業界分類カラム追加        | 低         | 0.5日    |
| AI業界判定ロジック        | 中         | 1日      |
| リードエンリッチメントAPI | 中         | 2日      |
| UI（業界フィルター）      | 低         | 1日      |

**合計見積工数: 4.5日**

---

## 🎯 機能仕様

### 1. リード情報検索機能

**現状:** ✅ 実装済み

```typescript
GET /api/leads?page=1&limit=100&industry=IT
```

**追加対応:**

- `industry` パラメータの追加
- 業界による絞り込み機能

### 2. スクレイピングによるデータ収集

**現状:** ✅ 実装済み（Jina AI Reader API使用）

既存の `crawlAndSummarizeSafe` 関数を活用：

- 企業のホームページURLから情報取得
- 構造化されたマークダウン形式で取得
- 企業の特徴、事業内容、サービスを自動抽出

### 3. データリスト化

**現状:** ✅ 実装済み（`lead_lists` テーブル）

現在のカラム:

- `homepage_url`: 企業URL
- `company_name`: 会社名
- `contact_name`: 担当者名
- `email`: メールアドレス
- `send_status`: 送信ステータス
- `import_file_name`: インポート元ファイル

### 4. 業界分類機能

**実装が必要:** ⚠️ 新規

#### 4-1. データベース拡張

```sql
-- lead_lists テーブルに業界カラムを追加
ALTER TABLE public.lead_lists
ADD COLUMN industry TEXT,
ADD COLUMN industry_confidence FLOAT, -- AI判定の信頼度 (0.0-1.0)
ADD COLUMN company_description TEXT, -- スクレイピングで取得した企業説明
ADD COLUMN company_services JSONB, -- サービス一覧
ADD COLUMN enriched_at TIMESTAMPTZ; -- エンリッチメント実行日時

-- 業界でインデックス作成
CREATE INDEX IF NOT EXISTS idx_lead_lists_industry ON public.lead_lists(industry);
```

#### 4-2. 業界分類ロジック（AI活用）

OpenAI APIを使用して企業情報から業界を自動判定：

**業界カテゴリ例:**

- IT・ソフトウェア
- 製造業
- 小売・EC
- 金融
- 医療・ヘルスケア
- 教育
- 不動産
- コンサルティング
- 広告・マーケティング
- 物流・運輸
- 飲食
- その他

**判定ロジック:**

1. スクレイピングで取得した企業情報を分析
2. OpenAI APIに業界判定を依頼
3. 信頼度スコアと共に保存

### 5. リードエンリッチメント機能

**実装が必要:** ⚠️ 新規

#### 5-1. エンリッチメントAPI

```typescript
POST /api/leads/enrich
{
  "leadIds": ["uuid1", "uuid2", ...], // 対象リードID配列
  "mode": "incremental" // "incremental" | "force"
}
```

**処理フロー:**

1. 指定されたリードの`homepage_url`を取得
2. 各URLに対してスクレイピング実行（並列処理）
3. 取得した情報をOpenAI APIで分析
   - 企業説明文の生成
   - 主要サービスの抽出
   - 業界の判定
4. データベースを更新

#### 5-2. バッチエンリッチメント機能

全リードまたは特定条件のリードを一括でエンリッチメント：

```typescript
POST /api/leads/enrich/batch
{
  "filters": {
    "industry": null, // 業界未分類のみ
    "enrichedAt": null // 未エンリッチメントのみ
  },
  "batchSize": 10, // 同時処理数
  "delay": 1000 // リクエスト間隔（ms）
}
```

**レート制限対策:**

- バッチサイズ制御
- リクエスト間にディレイ
- リトライロジック

---

## 🔧 実装計画

### Phase 1: データベース拡張（0.5日）

**タスク:**

- [ ] `lead_lists` テーブルにカラム追加
- [ ] マイグレーションファイル作成
- [ ] 既存データとの互換性確認

**ファイル:**

- `docs/migrations/add_industry_classification.sql`

### Phase 2: AI業界判定ロジック（1日）

**タスク:**

- [ ] OpenAI APIプロンプト設計
- [ ] 業界判定関数実装
- [ ] テストケース作成

**ファイル:**

- `src/lib/industryClassifier.ts`

**実装例:**

```typescript
export async function classifyIndustry(companyInfo: {
  name: string;
  url: string;
  description: string;
  services: string[];
}): Promise<{
  industry: string;
  confidence: number;
  reasoning: string;
}> {
  // OpenAI APIで業界判定
  // ...
}
```

### Phase 3: エンリッチメントAPI（2日）

**タスク:**

- [ ] `/api/leads/enrich` エンドポイント実装
- [ ] `/api/leads/enrich/batch` エンドポイント実装
- [ ] エラーハンドリング
- [ ] ログ記録機能

**ファイル:**

- `src/app/api/leads/enrich/route.ts`
- `src/app/api/leads/enrich/batch/route.ts`

### Phase 4: UI実装（1日）

**タスク:**

- [ ] 業界フィルター追加
- [ ] エンリッチメント実行ボタン
- [ ] 進捗表示
- [ ] 結果表示

**ファイル:**

- `src/app/dashboard/leads/page.tsx`（新規作成）
- `src/components/LeadEnrichment.tsx`

---

## 💡 使用例

### シナリオ1: CSVインポート後の自動エンリッチメント

```typescript
// 1. CSVからリードをインポート
const importResult = await fetch("/api/leads", {
  method: "POST",
  body: JSON.stringify({
    leads: csvData,
    fileName: "leads_2026-01.csv",
  }),
});

// 2. インポートしたリードを自動エンリッチメント
const enrichResult = await fetch("/api/leads/enrich/batch", {
  method: "POST",
  body: JSON.stringify({
    filters: { enrichedAt: null }, // 未エンリッチメントのみ
    batchSize: 5,
  }),
});
```

### シナリオ2: 業界別リード抽出

```typescript
// IT業界のリードのみ取得
const itLeads = await fetch("/api/leads?industry=IT・ソフトウェア");

// 製造業で未送信のリードを取得
const manufacturingLeads = await fetch(
  "/api/leads?industry=製造業&send_status=pending",
);
```

### シナリオ3: 特定リードの手動エンリッチメント

```typescript
// AgGridで選択したリードをエンリッチメント
const selectedIds = getSelectedRows().map((row) => row.id);

const result = await fetch("/api/leads/enrich", {
  method: "POST",
  body: JSON.stringify({
    leadIds: selectedIds,
    mode: "force", // 既にエンリッチメント済みでも再実行
  }),
});
```

---

## ⚠️ 注意事項

### 1. レート制限

**Jina AI Reader API:**

- 無料枠: 20リクエスト/分
- 有料プラン推奨（大量リード処理時）

**OpenAI API:**

- トークン消費量に注意
- バッチ処理時は適切な間隔を設定

### 2. データ品質

**スクレイピング失敗時:**

- URLが無効（404エラー）
- サイトがJavaScript必須
- アクセス制限（CAPTCHA等）

→ `enriched_at` を NULL のまま、`industry` に "不明" を設定

### 3. プライバシー・セキュリティ

**GDPR/個人情報保護:**

- スクレイピングは公開情報のみ
- 個人情報の取り扱いに注意
- ログの適切な保持期間設定

### 4. コスト

**見積:**

- Jina AI: 1,000リード × $0.001 = $1
- OpenAI API: 1,000リード × $0.01 = $10
- **合計: 約$11 / 1,000リード**

---

## 📊 期待される効果

### 営業効率向上

**Before:**

- 手動で企業情報を調査
- 業界不明のため優先順位がつけられない
- 送信先選定に時間がかかる

**After:**

- 自動で企業情報を収集
- 業界別に分類されたリスト
- ターゲット業界に絞った営業が可能

### 数値目標

- リード調査時間: **90%削減**（手動10分 → 自動1分）
- 送信先選定時間: **80%削減**
- アポ獲得率: **30%向上**（適切なターゲティング）

---

## 🚀 ロードマップ

### v1.0（基本機能）- 4.5日

- [x] データベース拡張
- [x] AI業界判定
- [x] エンリッチメントAPI
- [x] 基本UI

### v1.1（高度な分析）- 3日

- [ ] 企業規模の推定（従業員数、売上）
- [ ] ターゲットスコアリング（優先順位付け）
- [ ] 競合分析

### v1.2（自動化）- 2日

- [ ] スケジュール実行（cron）
- [ ] 新規リード自動エンリッチメント
- [ ] Webhook通知

---

## 関連ドキュメント

- [API仕様書](./api-sales-copy-specification.md)
- [データベーススキーマ](./saas-schema.sql)
- [クローラー実装](../src/lib/crawler.ts)
- [リードAPI](../src/app/api/leads/route.ts)

---

## 改訂履歴

| 日付       | バージョン | 変更内容 | 担当者       |
| ---------- | ---------- | -------- | ------------ |
| 2026-01-17 | 1.0.0      | 初版作成 | AI Assistant |
