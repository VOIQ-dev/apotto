import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@mantine/core/styles.css";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Vercel環境変数を使って動的にベースURLを設定
const getBaseUrl = () => {
  // Vercel環境
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // カスタム環境変数
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // ローカル開発環境
  return "http://localhost:3000";
};

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: {
    default: "apotto - AI営業支援プラットフォーム",
    template: "%s | apotto",
  },
  description:
    "apottoは、AI技術を活用した営業支援プラットフォームです。リード管理、PDF提案書生成、Chrome拡張機能による自動フォーム送信で営業活動を効率化します。",
  openGraph: {
    title: "apotto - AI営業支援プラットフォーム",
    description:
      "AI技術を活用した営業支援プラットフォーム。リード管理から提案書生成、自動フォーム送信まで。",
    url: "/",
    siteName: "apotto",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1408,
        height: 768,
        alt: "apotto - AI営業支援プラットフォーム",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "apotto - AI営業支援プラットフォーム",
    description:
      "AI技術を活用した営業支援プラットフォーム。リード管理から提案書生成、自動フォーム送信まで。",
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
