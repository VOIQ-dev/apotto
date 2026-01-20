# 営業メール生成API 仕様書

## 概要

営業メール生成APIは、送信者・受信者の情報と相手企業のWebサイトURLを受け取り、AI（OpenAI GPT）を使って営業メールの文案を自動生成するAPIです。

## エンドポイント

### 1. 通常レスポンス版（一括生成）

**エンドポイント**: `POST /api/ai/sales-copy`

**機能**: リクエスト受信後、メール文案の生成が完了してから一括でレスポンスを返します。

**最大実行時間**: 120秒

---

### 2. ストリーミング版（逐次生成）

**エンドポイント**: `POST /api/ai/sales-copy/stream`

**機能**: AIが生成するメール文案をストリーミング形式で逐次返却します。リアルタイムで生成過程を表示したい場合に使用します。

**最大実行時間**: 120秒

---

## リクエスト仕様

### リクエストボディ（JSON形式）

```json
{
  "sender": {
    "companyName": "株式会社サンプル",
    "department": "営業部",
    "title": "営業マネージャー",
    "fullName": "山田太郎",
    "email": "yamada@example.com",
    "phone": "03-1234-5678",
    "subject": "業務効率化のご提案",
    "meetingUrl": "https://calendly.com/example/meeting"
  },
  "recipient": {
    "companyName": "株式会社ターゲット",
    "department": "経営企画部",
    "title": "部長",
    "contactName": "佐藤花子",
    "email": "sato@target.co.jp",
    "homepageUrl": "https://target.co.jp"
  },
  "attachments": [
    {
      "name": "サービス資料.pdf",
      "url": "https://example.com/files/service.pdf",
      "token": "optional-access-token"
    }
  ],
  "notes": "特に貴社の○○事業に興味があります。",
  "tone": "formal",
  "language": "ja",
  "productContext": {
    "productSnapshot": "AI営業支援ツール「SalesPro」",
    "productWhy": "営業担当者の工数削減と成約率向上",
    "coreFeatures": "AI文案生成、自動追客、分析ダッシュボード",
    ...
  }
}
```

### パラメータ詳細

#### `sender` (オブジェクト, 必須)

送信者（営業担当者）の情報

| フィールド    | 型     | 必須 | 説明                            | デフォルト値 |
| ------------- | ------ | ---- | ------------------------------- | ------------ |
| `companyName` | string | ×    | 会社名                          | `◯◯◯`        |
| `department`  | string | ×    | 部署名                          | `◯◯◯`        |
| `title`       | string | ×    | 役職                            | `◯◯◯`        |
| `fullName`    | string | ×    | 担当者氏名                      | `◯◯◯`        |
| `email`       | string | ×    | メールアドレス                  | `◯◯◯`        |
| `phone`       | string | ×    | 電話番号                        | `◯◯◯`        |
| `subject`     | string | ×    | メール件名                      | `◯◯◯`        |
| `meetingUrl`  | string | ×    | 商談日程調整URL（Calendlyなど） | -            |

**注意**: 未入力の項目は自動的にプレースホルダー `◯◯◯` が設定されます。AI生成時にこのプレースホルダーを検出し、適切なフォールバック値（例: 会社名→「弊社」）に置き換えます。

#### `recipient` (オブジェクト, 必須)

受信者（営業先企業）の情報

| フィールド    | 型     | 必須 | 説明               | デフォルト値 |
| ------------- | ------ | ---- | ------------------ | ------------ |
| `companyName` | string | ×    | 会社名             | `◯◯◯`        |
| `department`  | string | ×    | 部署名             | `◯◯◯`        |
| `title`       | string | ×    | 役職               | `◯◯◯`        |
| `contactName` | string | ×    | 担当者氏名         | `◯◯◯`        |
| `email`       | string | ×    | メールアドレス     | `◯◯◯`        |
| `homepageUrl` | string | ○    | 企業WebサイトのURL | -            |

**注意**: `homepageUrl` のみ必須項目です。このURLをクローリングして企業情報を取得します。

#### `attachments` (配列, オプション)

添付資料の情報

| フィールド | 型     | 必須 | 説明                             |
| ---------- | ------ | ---- | -------------------------------- |
| `name`     | string | ○    | 資料名                           |
| `url`      | string | ○    | 資料のURL                        |
| `token`    | string | ×    | アクセストークン（必要に応じて） |

#### `notes` (string, オプション)

営業メールに含めたい追加情報やメモ

#### `tone` (string, オプション)

メールのトーン設定

- `"friendly"`: フレンドリー
- `"formal"`: フォーマル（デフォルト）
- `"casual"`: カジュアル

#### `language` (string, オプション)

生成言語

- `"ja"`: 日本語（デフォルト）
- `"en"`: 英語

#### `productContext` (オブジェクト, オプション)

商品・サービスの詳細情報。より精緻な営業メール生成のために使用します。

各フィールドの詳細は `ProductContext` 型定義を参照してください。

主なフィールド:

- `productSnapshot`: 商品名・ジャンル・一言特徴
- `productWhy`: 商品の存在理由
- `beforeAfter`: 導入前後の変化
- `targetSegments`: 主なターゲット
- `coreFeatures`: コア機能
- `qualBenefits`: 定性的メリット
- `quantBenefits`: 定量的メリット
- `differentiators`: 競合との違い

など、全16フィールド。

---

## レスポンス仕様

### 成功時（200 OK）

```json
{
  "success": true,
  "message": "件名: 【株式会社ターゲット向け】業務効率化のご提案\n\n本文:\n佐藤花子様\n\nお世話になっております。株式会社サンプルの山田太郎です。\n突然のご連絡となり誠に恐れ入ります。\n\n貴社のWebサイトを拝見し、AI技術を活用した業務効率化ソリューションを展開されている点に大変興味を持ちました。\n\n━━━━━━━━━━━━━━━\n■ ご相談概要\n...",
  "meta": {
    "characters": 542,
    "sourceUrl": "https://target.co.jp"
  }
}
```

| フィールド        | 型      | 説明                               |
| ----------------- | ------- | ---------------------------------- |
| `success`         | boolean | 処理成功フラグ（常にtrue）         |
| `message`         | string  | 生成されたメール文案（件名＋本文） |
| `meta.characters` | number  | 文案の文字数                       |
| `meta.sourceUrl`  | string  | クローリング対象URL                |

### エラー時（400 / 500）

```json
{
  "success": false,
  "message": "recipient.homepageUrl は必須です。"
}
```

| フィールド | 型      | 説明                        |
| ---------- | ------- | --------------------------- |
| `success`  | boolean | 処理失敗フラグ（常にfalse） |
| `message`  | string  | エラーメッセージ            |

---

## 処理フロー

### 1. リクエスト検証

- `sender` と `recipient` の必須チェック
- `recipient.homepageUrl` の必須チェック
- 各フィールドのトリム処理とプレースホルダー設定

### 2. Webクローリング

Jina AI Reader API を使用して企業Webサイトを解析し、構造化された企業情報を取得します。

**クローリングオプション**:

- 最大ページ数: 5ページ
- 最大深度: 2階層
- 同一オリジンのみ: true
- タイムアウト: 8秒

**フォールバック機能**: Jina API失敗時は基本的なHTTPフェッチで代替取得を試行します。

### 3. AI文案生成

OpenAI GPT モデルを使用してメール文案を生成します。

**プロンプト構成要素**:

- 送信者・受信者情報
- クローリング結果（企業の特徴・事業内容）
- 添付資料情報
- メモ（notes）
- 商品コンテキスト（productContext）
- トーン・言語設定

### 4. 出力の正規化

生成されたメール文案に対して以下の処理を実行:

- 件名・本文の形式チェック
- プレースホルダーの解決（`◯◯◯` → 適切なフォールバック値）
- 署名ブロックの追加（会社名、担当者名、連絡先情報）
- 句点の補完

**署名フォーマット例**:

```
===================
株式会社サンプル
山田太郎
Email: yamada@example.com
TEL: 03-1234-5678
===================
```

### 5. フォールバック生成（OpenAI失敗時）

OpenAI APIが失敗した場合、ローカルテンプレートを使用してメール文案を生成します。

**テンプレート構成**:

- 受信者への挨拶
- 送信者の自己紹介
- クローリング結果に基づく企業への言及
- 提案内容（罫線で視覚的に区切り）
- 添付資料の紹介
- 補足メモ
- CTAと締めの挨拶

---

## エラーハンドリング

### バリデーションエラー（400 Bad Request）

| エラーメッセージ                     | 原因                           |
| ------------------------------------ | ------------------------------ |
| `sender が指定されていません。`      | `sender` フィールドが未指定    |
| `recipient が指定されていません。`   | `recipient` フィールドが未指定 |
| `recipient.homepageUrl は必須です。` | `homepageUrl` が空または未指定 |

### サーバーエラー（500 Internal Server Error）

- OpenAI API エラー（フォールバック生成に自動切り替え）
- クローリングエラー（基本フェッチに自動切り替え）
- その他予期しないエラー

**注意**: OpenAI失敗時もエラーステータスは返さず、フォールバックテンプレートで成功レスポンスを返します。

---

## セキュリティ・制限事項

### タイムアウト

- API全体: 最大120秒
- Webクローリング: 最大8秒（Jina API）、10秒（基本フェッチ）

### レート制限

- OpenAI APIのレート制限に準拠

### データ保護

- リクエストデータはログに記録されません（URL、文字数などメタ情報のみ）
- 添付資料のトークンは外部送信されません

---

## 使用技術

- **Next.js**: API Routes（App Router）
- **OpenAI API**: GPT-4モデルによる文案生成
- **Jina AI Reader API**: Webページの構造化抽出
- **ランタイム**: Node.js
- **最大実行時間**: 120秒

---

## 関連ファイル

- API実装: `src/app/api/ai/sales-copy/route.ts`
- ストリーミング版: `src/app/api/ai/sales-copy/stream/route.ts`
- OpenAIクライアント: `src/lib/openaiClient.ts`
- Webクローラー: `src/lib/crawler.ts`
- プレースホルダー処理: `src/lib/placeholders.ts`
- 商品コンテキスト: `src/lib/productContext.ts`

---

## バージョン情報

- **最終更新日**: 2026-01-17
- **APIバージョン**: 1.0.0
