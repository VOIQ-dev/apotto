# Playwright対応 Node.js イメージ
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

# package.jsonをコピーして依存関係をインストール
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile || yarn install

# ソースコードをコピー
COPY . .

# TypeScriptをビルド
RUN yarn build

# ポート公開
EXPOSE 3001

# 環境変数のデフォルト
ENV NODE_ENV=production
ENV PORT=3001

# サーバー起動
CMD ["node", "dist/index.js"]

