import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync } from "fs";

// アイコンをコピーするプラグイン
function copyIconsPlugin() {
  return {
    name: "copy-icons",
    closeBundle() {
      const distIconsDir = resolve(__dirname, "dist/icons");
      if (!existsSync(distIconsDir)) {
        mkdirSync(distIconsDir, { recursive: true });
      }

      // 親プロジェクトからアイコンをコピー（apotto_extension_logo.pngを使用）
      const sourceIcon = resolve(
        __dirname,
        "../public/apotto/apotto_extension_logo.png",
      );
      if (existsSync(sourceIcon)) {
        copyFileSync(sourceIcon, resolve(distIconsDir, "icon16.png"));
        copyFileSync(sourceIcon, resolve(distIconsDir, "icon48.png"));
        copyFileSync(sourceIcon, resolve(distIconsDir, "icon128.png"));
        console.log(
          "✅ Icons copied successfully (using apotto_extension_logo.png)",
        );
      } else {
        console.warn(
          "⚠️ Source icon not found at ../public/apotto/apotto_extension_logo.png",
        );
      }

      // manifest.jsonをコピー
      copyFileSync(
        resolve(__dirname, "manifest.json"),
        resolve(__dirname, "dist/manifest.json"),
      );
      console.log("✅ manifest.json copied");
    },
  };
}

export default defineConfig({
  plugins: [react(), copyIconsPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/formHandler.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") {
            return "src/background/index.js";
          }
          if (chunkInfo.name === "content") {
            return "src/content/formHandler.js";
          }
          return "src/popup/assets/[name]-[hash].js";
        },
        chunkFileNames: "src/popup/assets/[name]-[hash].js",
        assetFileNames: "src/popup/assets/[name]-[hash].[ext]",
      },
    },
    sourcemap: process.env.NODE_ENV === "development",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
