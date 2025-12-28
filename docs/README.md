# 開発ドキュメント

このディレクトリには、プロジェクトの開発規約とガイドラインが含まれています。

## 📋 規約ドキュメント

### [コミットメッセージ規約](./commit-convention.md)
- コミットメッセージの形式とルール
- Type一覧と使い分け
- 良い例・悪い例
- チェックリスト

### [コーディング規約](./coding-convention.md)
- TypeScript/Next.jsのベストプラクティス
- コンポーネント設計
- API Route規約
- セキュリティガイドライン
- パフォーマンス最適化

### [Git Hooksセットアップ](./setup-git-hooks.md)
- Husky・lint-stagedの設定手順
- pre-commit / commit-msg フックの説明
- トラブルシューティング

## 🚀 クイックスタート

### 1. 初回セットアップ

```bash
# 依存パッケージのインストール
yarn install

# Git Hooksのセットアップ
yarn add -D husky lint-staged prettier
yarn husky init
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg
```

### 2. 開発前の確認

開発を始める前に以下を確認してください：

- ✅ [コーディング規約](./coding-convention.md) を一読
- ✅ [コミットメッセージ規約](./commit-convention.md) を理解
- ✅ Git Hooksが正常に動作するか確認

### 3. コミット時の注意

```bash
# ❌ 悪い例
git commit -m "修正"
git commit -m "いろいろ変更"

# ✅ 良い例
git commit -m "feat: PDF閲覧追跡機能を追加"
git commit -m "fix: ログインセッションのタイムアウトエラーを修正"
```

## 🛠️ 品質チェック

### ローカルでの確認方法

```bash
# TypeScript型チェック
yarn tsc --noEmit

# ESLint
yarn lint

# ビルド確認
yarn build

# 開発サーバー起動
yarn dev
```

### 自動チェック（Git Hooks）

コミット時に自動実行：
- **pre-commit**: ESLint、Prettier、TypeScript型チェック
- **commit-msg**: コミットメッセージ規約チェック

## 📖 その他のドキュメント

### データベーススキーマ
- [SaaSスキーマ](./saas-schema.sql)
- [PDF追跡・保持ポリシー](./pdf-tracking-retention.sql)

## 🤝 コントリビューション

1. 機能ブランチを作成
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. 変更をコミット（規約に従う）
   ```bash
   git commit -m "feat: 新機能の説明"
   ```

3. プルリクエストを作成
   - [PRテンプレート](../.github/PULL_REQUEST_TEMPLATE.md) に従って記入
   - レビュアーを指定

## ❓ よくある質問

### Q. コミットメッセージが長くなってしまう

A. 件名は50文字以内に抑え、詳細は本文に記載してください：

```
feat: PDF閲覧追跡機能を追加

営業担当者が顧客のPDF閲覧状況を把握できるように追跡機能を実装。

実装内容:
- トークンベースの追跡リンク生成
- 閲覧進捗のリアルタイム記録
- ダッシュボードでの閲覧状況表示
```

### Q. Git Hooksでエラーが出る

A. [setup-git-hooks.md](./setup-git-hooks.md) のトラブルシューティングを参照してください。

### Q. 一時的にHooksをスキップしたい

A. 基本的に推奨しませんが、緊急時は `--no-verify` を使用：

```bash
git commit --no-verify -m "feat: 緊急修正"
```

## 📚 参考リソース

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [React Best Practices](https://react.dev/learn)

## 📝 更新履歴

- 2025-12-28: 初版作成（コミット規約、コーディング規約、Git Hooks設定）
