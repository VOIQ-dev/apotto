import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // XSS対策: Content Security Policy
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.jsのHMRに必要
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https:",
              "frame-ancestors 'none'", // クリックジャッキング対策
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          // クリックジャッキング対策
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // MIME-sniffing対策
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Referrerポリシー（プライバシー保護）
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // 権限ポリシー（不要な機能を無効化）
          {
            key: "Permissions-Policy",
            value: [
              "camera=()",
              "microphone=()",
              "geolocation=()",
              "interest-cohort=()", // FLoC対策
            ].join(", "),
          },
          // HTTPS強制（本番環境のみ推奨）
          // 注意: 開発環境ではコメントアウト推奨
          // {
          //   key: "Strict-Transport-Security",
          //   value: "max-age=31536000; includeSubDomains; preload",
          // },
        ],
      },
    ];
  },
};

export default nextConfig;
