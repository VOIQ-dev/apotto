# Auto-Submit Worker (Railway)

Playwright を使用した自動フォーム送信ワーカーサーバーです。
Vercel ではPlaywrightが動作しないため、Railway にデプロイして使用します。

## アーキテクチャ

```
┌─────────────────┐         ┌─────────────────┐
│     Vercel      │         │    Railway      │
│  (フロント/API)  │ ──────▶ │   (Playwright)  │
│                 │   HTTP  │  auto-submit    │
└─────────────────┘         └─────────────────┘
```

## ローカル開発

```bash
cd server

# 依存関係インストール
yarn install

# Playwright ブラウザをインストール（初回のみ）
npx playwright install chromium

# 開発サーバー起動
yarn dev
```

## Railway へのデプロイ

### 1. Railway アカウント作成

https://railway.app/ でアカウントを作成

### 2. 新規プロジェクト作成

1. Railway ダッシュボードで「New Project」をクリック
2. 「Deploy from GitHub repo」を選択
3. リポジトリを選択

### 3. サービス設定

1. 作成されたサービスをクリック
2. 「Settings」タブを開く
3. 以下を設定:
   - **Root Directory**: `server`
   - **Build Command**: `yarn install && yarn build`
   - **Start Command**: `node dist/index.js`

### 4. 環境変数設定

「Variables」タブで以下を設定:

| 変数名            | 値                            | 説明                                               |
| ----------------- | ----------------------------- | -------------------------------------------------- |
| `PORT`            | `3001`                        | サーバーポート（Railway が自動設定する場合は不要） |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` | CORS許可オリジン（カンマ区切りで複数可）           |

### 5. デプロイ

設定完了後、自動でデプロイが開始されます。

### 6. Vercel 側の環境変数設定

Vercel のプロジェクト設定で以下を追加:

| 変数名                   | 値                                        |
| ------------------------ | ----------------------------------------- |
| `AUTO_SUBMIT_WORKER_URL` | `https://your-railway-app.up.railway.app` |

## API エンドポイント

### ヘルスチェック

```
GET /health
```

レスポンス:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### フォーム自動送信

```
POST /auto-submit
Content-Type: application/json

{
  "url": "https://example.com/contact",
  "company": "株式会社テスト",
  "name": "山田太郎",
  "email": "test@example.com",
  "phone": "03-1234-5678",
  "subject": "お問い合わせ",
  "message": "お問い合わせ内容",
  "debug": false
}
```

レスポンス:

```json
{
  "success": true,
  "logs": ["[100ms] Step 1: Browser launched..."],
  "finalUrl": "https://example.com/contact/thanks"
}
```

## トラブルシューティング

### ブラウザ起動エラー

Docker 環境では以下の引数が必要です（すでに設定済み）:

- `--no-sandbox`
- `--disable-setuid-sandbox`
- `--disable-dev-shm-usage`

### メモリ不足

Railway のプラン設定でメモリを増やしてください（推奨: 1GB以上）

### タイムアウト

長時間のフォーム操作が必要な場合は、Railway のサービス設定でタイムアウトを延長してください。
