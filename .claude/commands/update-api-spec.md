---
description: 営業メール生成APIのAPI仕様書を最新の実装に基づいて更新
---

営業メール生成APIのAPI仕様書（`docs/api-sales-copy-specification.md`）を最新のコード実装に基づいて更新してください。

以下の手順で更新を行ってください：

1. 最新のAPI実装を確認する
   - `src/app/api/ai/sales-copy/route.ts`
   - `src/app/api/ai/sales-copy/stream/route.ts`
   - `src/lib/openaiClient.ts`
   - `src/lib/crawler.ts`
   - `src/lib/placeholders.ts`
   - `src/lib/productContext.ts`

2. 実装内容と仕様書の差分を確認する
   - エンドポイントの変更
   - リクエスト/レスポンス仕様の変更
   - パラメータの追加・削除・変更
   - 処理フローの変更
   - エラーハンドリングの変更

3. API仕様書を更新する
   - 変更された内容を反映
   - 新しいパラメータの説明を追加
   - 削除されたパラメータを削除
   - 処理フローの図や説明を更新
   - 使用例の更新

4. 更新後、変更内容をユーザーに報告する
   - どの部分が変更されたか
   - 主な変更理由
   - 破壊的変更がある場合は明記

**重要**: 実装コードが真実（source of truth）です。仕様書は実装に合わせて更新してください。
