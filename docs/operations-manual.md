# 運用手順書

最終更新: 2026-02-06

## 📋 目次

1. [システム構成概要](#システム構成概要)
2. [リポジトリ管理](#リポジトリ管理)
3. [デプロイ環境](#デプロイ環境)
4. [アクセス権限管理](#アクセス権限管理)
5. [環境変数設定](#環境変数設定)
6. [日常運用](#日常運用)
7. [障害対応](#障害対応)
8. [緊急連絡先](#緊急連絡先)

---

## システム構成概要

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                       GitHub                            │
│           github.com/VOIQ-dev/apotto                    │
│                  (master branch)                        │
└───────────┬─────────────────────────────────────────────┘
            │
            │ push → auto deploy
            ▼
┌─────────────────────┐         ┌─────────────────────────┐
│      Vercel         │  通信    │  Chrome拡張機能          │
│  (フロントエンド)      │◀───────▶│  (フォーム送信)           │
│   Next.js App       │         │  ユーザーブラウザ          │
└─────────┬───────────┘         └─────────────────────────┘
          │
          ▼
┌─────────────────────┐
│     Supabase        │
│   (Database)        │
│  + Storage          │
└─────────────────────┘
```

### 各コンポーネントの役割

| コンポーネント     | 役割                                        | URL                                                         |
| ------------------ | ------------------------------------------- | ----------------------------------------------------------- |
| **Vercel**         | Next.jsフロントエンド・APIホスティング      | https://apotto-chi.vercel.app                               |
| **Chrome拡張機能** | フォーム自動送信（並行処理対応）            | Chrome Web Store（公開後）                                  |
| **Supabase**       | PostgreSQLデータベース + ファイルストレージ | https://supabase.com/dashboard/project/xrbegapyfpzomdgiwnwa |
| **GitHub**         | ソースコード管理                            | https://github.com/VOIQ-dev/apotto                          |
| **Railway**        | （使用停止）将来的に予約送信機能で使用予定  | -                                                           |

---

## リポジトリ管理

### 基本情報

- **リポジトリURL**: https://github.com/VOIQ-dev/apotto
- **オーナー**: VOIQ-dev
- **リポジトリ名**: apotto
- **メインブランチ**: `master`

### ブランチ戦略

⚠️ **重要**: 現在は`master`ブランチに直接pushする運用です。

```
master ブランチへのpush
   ↓
自動デプロイ（Vercel + Railway）
```

**注意事項:**

- `master`へのpushは即座に本番環境へデプロイされます
- コミット前に必ずローカルでテストを実施してください
- 緊急時以外は、Pull Requestを作成してレビュー後にマージすることを推奨

### コミットメッセージ規約

詳細は [commit-convention.md](./commit-convention.md) を参照

**基本フォーマット:**

```
<type>: <subject>

<body>
```

**Type一覧:**

- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント変更
- `refactor`: リファクタリング
- `test`: テスト追加・修正
- `chore`: ビルド・設定変更

---

## デプロイ環境

### 1. Vercel（フロントエンド）

#### 概要

- Next.jsアプリケーションのホスティング
- masterブランチへのpushで自動デプロイ

#### アクセス方法

1. https://vercel.com/ にアクセス
2. VOIQ-devアカウントでログイン
3. `apotto`プロジェクトを選択

#### デプロイ確認

- **本番URL**: https://apotto-chi.vercel.app
- **デプロイ履歴**: Vercelダッシュボード > Deployments

#### ロールバック方法

1. Vercelダッシュボードで該当デプロイを選択
2. 「...」メニューから「Redeploy」を選択

### 2. Railway（Playwright Worker）

#### 概要

- ブラウザ自動操作（Playwright）サーバー
- お問い合わせフォームへの自動入力・送信を担当
- masterブランチへのpushで自動デプロイ

#### アクセス方法

1. https://railway.app/ にアクセス
2. VOIQ-devアカウントでログイン
3. `auto-submit-worker`プロジェクトを選択

#### サービス設定

- **Root Directory**: `server`
- **Build Command**: `yarn install && yarn build`
- **Start Command**: `node dist/index.js`
- **推奨メモリ**: 1GB以上

#### ヘルスチェック

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

### 3. Supabase（データベース）

#### 概要

- PostgreSQLデータベース
- ファイルストレージ（PDF保管）

#### アクセス方法

1. https://supabase.com/dashboard にアクセス
2. プロジェクトID: `xrbegapyfpzomdgiwnwa`
3. ダッシュボードへアクセス

#### データベースURL

```
https://supabase.com/dashboard/project/xrbegapyfpzomdgiwnwa
```

#### バックアップ状況

⚠️ **未設定**: 現在バックアップの自動設定はありません

**推奨対応:**

1. Supabaseダッシュボード > Settings > Database
2. 「Point in Time Recovery (PITR)」を有効化
3. 自動バックアップスケジュールを設定（日次推奨）

---

## アクセス権限管理

### GitHubリポジトリ

| 名前           | 役割           | 権限  |
| -------------- | -------------- | ----- |
| 紙谷（開発者） | 開発・実装     | Admin |
| 高田（代表）   | レビュー・承認 | Admin |

**権限付与手順:**

1. GitHub > リポジトリ設定 > Collaborators
2. 「Add people」から招待
3. 権限レベルを選択（Read, Write, Admin）

### Vercel

| 名前           | 役割         | 権限  |
| -------------- | ------------ | ----- |
| 紙谷（開発者） | デプロイ管理 | Owner |
| 高田（代表）   | 監視・承認   | Owner |

**権限付与手順:**

1. Vercel > Project Settings > Members
2. 招待リンクまたはメールアドレスで招待

### Railway

| 名前           | 役割         | 権限  |
| -------------- | ------------ | ----- |
| 紙谷（開発者） | サーバー管理 | Admin |
| 高田（代表）   | 監視・承認   | Admin |

**権限付与手順:**

1. Railway > Project Settings > Members
2. メールアドレスで招待

### Supabase

| 名前           | 役割         | 権限  |
| -------------- | ------------ | ----- |
| 紙谷（開発者） | DB管理・運用 | Owner |
| 高田（代表）   | 監視・承認   | Owner |

**権限付与手順:**

1. Supabase > Project Settings > Team
2. メールアドレスで招待

### 本番環境アクセス

**アクセス可能者:**

- 紙谷（開発者）
- 代表が承認した社員

**アクセス方法:**

- Vercel/Railway/Supabaseの各ダッシュボードから管理
- SSH接続は不要（すべてWeb UIで管理）

---

## 環境変数設定

### Vercel環境変数

Vercel > Project Settings > Environment Variables

| 変数名                            | 説明                                | 例                            |
| --------------------------------- | ----------------------------------- | ----------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase プロジェクトURL            | https://xxx.supabase.co       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Supabase 公開APIキー                | eyJ...                        |
| `SUPABASE_SERVICE_ROLE_KEY`       | Supabase サービスロールキー（秘密） | eyJ...                        |
| `SUPABASE_JWT_SECRET`             | Supabase JWT署名キー                | xxx                           |
| `NEXT_PUBLIC_BASE_URL`            | アプリケーションベースURL           | https://apotto-chi.vercel.app |
| `NEXT_PUBLIC_CHROME_EXTENSION_ID` | Chrome拡張機能ID（Web Store公開後） | abcdef...（32文字）           |
| `AUTO_SUBMIT_WORKER_URL`          | （廃止）将来の予約送信機能で使用    | -                             |
| `OPENAI_API_KEY`                  | OpenAI APIキー                      | sk-...                        |
| `SLACK_WEBHOOK_URL`               | Slack通知用WebhookURL               | https://hooks.slack.com/...   |

### Railway環境変数

⚠️ **現在使用停止中** - 将来的に予約送信機能を実装する際に使用予定

~~Railway > Project > Variables~~

~~| 変数名 | 説明 | 例 |~~
~~| ----------------- | -------------------------------- | ----------------------------- |~~
~~| `PORT` | サーバーポート | 3001 |~~
~~| `ALLOWED_ORIGINS` | CORS許可オリジン（カンマ区切り） | https://apotto-chi.vercel.app |~~

### 環境変数の追加・変更手順

1. **Vercel**:
   - Vercel ダッシュボード > Settings > Environment Variables
   - 「Add New」から追加
   - Production/Preview/Development 環境を選択
   - 変更後、再デプロイが必要

2. **Railway**:
   - Railway ダッシュボード > Variables タブ
   - 「New Variable」から追加
   - 変更は自動的に次回デプロイ時に反映

---

## 日常運用

### ログ確認

#### Vercel

1. Vercel ダッシュボード > プロジェクト選択
2. 「Logs」タブを選択
3. リアルタイムログおよび過去ログを確認

**確認項目:**

- API エラー
- ビルドエラー
- 実行時エラー

#### Railway

⚠️ **現在使用停止中** - 将来的に予約送信機能を実装する際に使用予定

#### Chrome拡張機能

1. Chromeブラウザでapottoアプリを開く
2. Chrome右上の拡張機能アイコン（緑色のロゴ）をクリック
3. Popupで送信ステータスを確認

**確認項目:**

- 待機中と処理中の件数
- 成功と失敗の件数
- エラーが発生している企業の詳細
- 並行タブ数の設定

#### Supabase

1. Supabase ダッシュボード > Logs
2. Database/API/Auth ログを確認

**確認項目:**

- データベースエラー
- 認証エラー
- ストレージエラー

### 監視・アラート

#### 現状

⚠️ **エラー監視ツール未使用**

#### 推奨対応

以下のツール導入を検討：

- **Sentry**: エラートラッキング
- **Datadog**: パフォーマンス監視
- **Better Uptime**: 稼働監視・アラート

### Slack通知

現在有効な通知：

- システムエラー（SLACK_WEBHOOK_URL経由）

**通知確認:**

1. Slackチャンネルを確認
2. Webhookテスト: `curl -X POST -H 'Content-type: application/json' --data '{"text":"Test"}' $SLACK_WEBHOOK_URL`

### Chrome拡張機能の管理

#### 拡張機能のバージョン管理

現在のバージョン: **1.2.0**

**更新手順:**

1. `chrome-extension/`フォルダで修正
2. `manifest.json`のバージョン番号を更新
3. `yarn build`でビルド
4. `zip -r apotto-extension.zip dist/`でZIP作成
5. Chrome Web Storeで新バージョンをアップロード
6. 審査後、自動的にユーザーに配信

#### 拡張機能の動作確認

1. Chrome拡張機能のアイコンをクリック
2. Popup表示を確認
3. 統計情報が正しく表示されるか確認
4. テスト送信を実行して動作確認

#### トラブルシューティング

**拡張機能が接続できない:**

- Extension IDが環境変数に正しく設定されているか確認
- `externally_connectable`のmatchesに本番URLが含まれているか確認
- Chrome Web Storeで公開されているか確認

**並行処理が動作しない:**

- 並行タブ数の設定が正しく保存されているか確認
- chrome.storage.localの値を確認
- Service Workerのログを確認

### 定期メンテナンス作業

#### 週次

- [ ] Vercelデプロイ履歴の確認
- [ ] Chrome拡張機能の動作確認
- [ ] エラーログの確認
- [ ] 送信成功率の確認

#### 月次

- [ ] 依存パッケージの更新確認
- [ ] Chrome拡張機能のバージョン更新検討
- [ ] Supabaseストレージ使用量確認
- [ ] ログクレンジング実行（`scripts/cleanup-logs.mjs`）
- [ ] リード表のデータメンテナンス

#### 四半期

- [ ] アクセス権限の棚卸し
- [ ] バックアップ設定の確認
- [ ] セキュリティアップデート適用
- [ ] Chrome拡張機能の審査・更新

---

## 障害対応

### 障害レベルの定義

| レベル       | 定義               | 対応時間    |
| ------------ | ------------------ | ----------- |
| **Critical** | サービス全体停止   | 即時対応    |
| **High**     | 主要機能が利用不可 | 1時間以内   |
| **Medium**   | 一部機能に影響     | 4時間以内   |
| **Low**      | 軽微な不具合       | 1営業日以内 |

### 障害対応フロー

```
1. 障害検知
   ↓
2. 影響範囲の特定
   ↓
3. 一時対応（ロールバック等）
   ↓
4. 根本原因の調査
   ↓
5. 恒久対応
   ↓
6. 再発防止策の実施
```

### よくある障害と対処法

#### 1. Vercelデプロイ失敗

**症状:**

- デプロイが失敗する
- ビルドエラーが表示される

**対処法:**

1. Vercel ダッシュボードでエラーログを確認
2. ローカルで `yarn build` を実行して再現確認
3. エラーを修正して再度push
4. 失敗が続く場合は前回のデプロイにロールバック

#### 2. Railwayサーバーダウン

**症状:**

- `/health` エンドポイントが応答しない
- フォーム送信が失敗する

**対処法:**

1. Railway ダッシュボードでサーバーステータス確認
2. ログでエラー原因を特定
3. 「Restart」ボタンでサーバー再起動
4. メモリ不足の場合はプランをアップグレード

#### 3. Supabaseデータベースエラー

**症状:**

- データ取得・保存ができない
- 認証エラーが発生

**対処法:**

1. Supabase ダッシュボードでステータス確認
2. クエリログで異常なクエリを特定
3. 環境変数（API Key等）の確認
4. 接続数上限を確認（必要に応じてプラン変更）

#### 4. OpenAI APIエラー

**症状:**

- AIメール生成が失敗する
- Quota exceeded エラー

**対処法:**

1. OpenAI APIキーの有効性確認
2. 使用量・クォータ確認
3. フォールバック機能が動作しているか確認
4. 必要に応じてAPIキーを更新

### ロールバック手順

#### Vercel

1. Vercel ダッシュボード > Deployments
2. 正常動作していた過去のデプロイを選択
3. 「...」メニュー > 「Redeploy」

#### Railway

1. Railway ダッシュボード > Deployments
2. 正常動作していた過去のデプロイを選択
3. 「Rollback」ボタンをクリック

#### データベース（Supabase）

⚠️ **バックアップ未設定のため、データロールバック不可**

- アプリケーションコードのロールバックで対応
- 早急にバックアップ設定を実施すること

---

## 緊急連絡先

### 開発チーム

| 名前 | 役割             | 連絡方法                 |
| ---- | ---------------- | ------------------------ |
| 紙谷 | 開発者（主担当） | Slack DM / メール        |
| 高田 | 代表（承認者）   | Slack DM / メール / 電話 |

### エスカレーション

```
Level 1: 紙谷（開発者）
   ↓ 対応困難・承認が必要
Level 2: 高田（代表）
   ↓ 外部サポートが必要
Level 3: 各サービスのサポート窓口
```

### サービスサポート窓口

| サービス | サポートURL                  |
| -------- | ---------------------------- |
| Vercel   | https://vercel.com/support   |
| Railway  | https://railway.app/help     |
| Supabase | https://supabase.com/support |
| GitHub   | https://support.github.com/  |

---

## 関連ドキュメント

- [README.md](../README.md) - プロジェクト概要
- [coding-convention.md](./coding-convention.md) - コーディング規約
- [commit-convention.md](./commit-convention.md) - コミットメッセージ規約
- [deployment-guide.md](./deployment-guide.md) - デプロイ手順書（別途作成予定）
- [backup-policy.md](./backup-policy.md) - バックアップポリシー（別途作成予定）

---

## 改訂履歴

| 日付       | バージョン | 変更内容 | 担当者       |
| ---------- | ---------- | -------- | ------------ |
| 2026-01-17 | 1.0.0      | 初版作成 | AI Assistant |
