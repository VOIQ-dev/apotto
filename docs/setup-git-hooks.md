# Git Hooks セットアップガイド

## 概要

このプロジェクトでは、コードとコミットメッセージの品質を担保するために、Git Hooksを使用しています。

## 使用しているツール

- **Husky**: Git Hooksを簡単に管理
- **lint-staged**: ステージングされたファイルのみをlint
- **ESLint**: コード品質チェック
- **Prettier**: コードフォーマット
- **TypeScript**: 型チェック

## セットアップ手順

### 1. 依存パッケージのインストール

```bash
# Huskyのインストール
yarn add -D husky

# lint-stagedのインストール
yarn add -D lint-staged

# Prettierのインストール（未インストールの場合）
yarn add -D prettier
```

### 2. Huskyの初期化

```bash
# Huskyの初期化
yarn husky init

# Git hooksディレクトリの作成
mkdir -p .husky
```

### 3. package.json にスクリプト追加

```json
{
  "scripts": {
    "prepare": "husky install",
    "lint-staged": "lint-staged"
  }
}
```

### 4. Hooks有効化

```bash
# Huskyインストール（初回のみ）
yarn prepare

# pre-commitフックに実行権限を付与
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg
```

## 実装されているHooks

### pre-commit

コミット前に以下を実行：

1. **lint-staged**: ステージングされたファイルに対して
   - ESLint実行（自動修正）
   - Prettier実行（フォーマット）

2. **TypeScript型チェック**: プロジェクト全体の型エラーを検出

```bash
# 手動実行
yarn lint-staged
yarn tsc --noEmit
```

### commit-msg

コミットメッセージが規約に準拠しているかチェック：

- 形式: `<type>: <subject>`
- typeは規定の値（feat, fix, refactorなど）
- 件名は50文字以内を推奨

詳細は [commit-convention.md](./commit-convention.md) を参照。

## トラブルシューティング

### Hooksが実行されない

```bash
# .git/hooks/が正しくシンボリックリンクされているか確認
ls -la .git/hooks/

# Huskyを再インストール
rm -rf .husky
yarn husky install
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg
```

### lint-stagedがエラーになる

```bash
# ESLintキャッシュをクリア
rm -rf .eslintcache

# node_modulesを再インストール
rm -rf node_modules
yarn install
```

### TypeScript型チェックでエラー

```bash
# 型エラーを確認
yarn tsc --noEmit

# エラーを修正してから再度コミット
```

### 一時的にHooksをスキップしたい場合

**注意**: 基本的に推奨しませんが、緊急時のみ使用可能

```bash
# --no-verifyオプションでスキップ
git commit --no-verify -m "feat: 緊急修正"
```

## ベストプラクティス

1. **コミット前の確認**
   - エディタでESLintエラーを事前に修正
   - TypeScript型エラーを確認

2. **小さくコミット**
   - 1コミット = 1機能/修正
   - レビューしやすいサイズに保つ

3. **コミットメッセージ規約を守る**
   - 明確なtypeを選択
   - 簡潔で分かりやすい件名

4. **Hooksの確認**
   - 定期的にHooksが正常動作しているか確認
   - チームメンバー全員が同じ設定で作業

## 参考

- [Husky Documentation](https://typicode.github.io/husky/)
- [lint-staged Documentation](https://github.com/lint-staged/lint-staged)
- [Prettier Documentation](https://prettier.io/docs/en/)
