---
description: 営業メール生成APIの全ドキュメント（仕様書・操作マニュアル）を一括更新
---

営業メール生成APIのすべてのドキュメントを最新のコード実装に基づいて一括更新してください。

以下の2つのドキュメントを順番に更新します：

## 1. API仕様書の更新

`docs/api-sales-copy-specification.md` を更新してください。

手順：

- 最新のAPI実装コードを確認する
  - `src/app/api/ai/sales-copy/route.ts`
  - `src/app/api/ai/sales-copy/stream/route.ts`
  - `src/lib/openaiClient.ts`
  - `src/lib/crawler.ts`
  - `src/lib/placeholders.ts`
  - `src/lib/productContext.ts`
- 実装とドキュメントの差分を確認する
- API仕様書を更新する
  - エンドポイント詳細
  - リクエスト/レスポンス仕様
  - パラメータ一覧
  - 処理フロー
  - エラーハンドリング

## 2. 操作方法マニュアルの更新

`docs/api-sales-copy-usage.md` を更新してください。

手順：

- 更新されたAPI仕様書を確認する
- 最新のAPI実装を確認する
- 操作マニュアルを更新する
  - 基本的な使い方
  - 実装例（JavaScript, TypeScript, Python）
  - ストリーミング版の使い方
  - よくあるユースケース
  - トラブルシューティング
  - ベストプラクティス

## 3. 更新内容の報告

両方のドキュメントの更新完了後、以下を報告してください：

- 各ドキュメントで変更された主な内容
- 破壊的変更がある場合は明記
- ユーザーが注意すべき点
- 更新日時

**重要**: 実装コードが真実（source of truth）です。ドキュメントは実装に合わせて更新してください。
