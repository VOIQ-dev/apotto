"use client";

import { useEffect, useRef, useState } from "react";

type ScoreLevel = "high" | "medium" | "low";

const scoreConfig: Record<
  ScoreLevel,
  {
    label: string;
    gradient: string;
    glowColor: string;
    iconBg: string;
    leads: number;
    action: string;
    companies: { name: string; time: string }[];
  }
> = {
  high: {
    label: "インテントスコア：高",
    gradient: "from-emerald-400 to-emerald-400",
    glowColor: "shadow-emerald-500/30",
    iconBg: "bg-emerald-400",
    leads: 13,
    action: "送信から3日以内に開封",
    companies: [
      { name: "Aストラテジー株式会社", time: "2分前" },
      { name: "株式会社Bワークス", time: "15分前" },
      { name: "株式会社Cトレーディング", time: "32分前" },
      { name: "Dプロダクト合同会社", time: "1時間前" },
      { name: "Eテック株式会社", time: "3時間前" },
      { name: "株式会社Fソリューションズ", time: "5時間前" },
      { name: "Gホールディングス株式会社", time: "8時間前" },
    ],
  },
  medium: {
    label: "インテントスコア：中",
    gradient: "from-emerald-600 to-teal-600",
    glowColor: "shadow-emerald-600/20",
    iconBg: "bg-emerald-600",
    leads: 24,
    action: "送信から3日〜1週間以内に開封",
    companies: [
      { name: "株式会社Hインダストリー", time: "1日前" },
      { name: "Iコンサルティング合同会社", time: "1日前" },
      { name: "株式会社Jクリエイティブ", time: "2日前" },
      { name: "Kシステム株式会社", time: "2日前" },
      { name: "株式会社Lマーケティング", time: "2日前" },
      { name: "Mサービス合同会社", time: "3日前" },
      { name: "Nエンタープライズ株式会社", time: "3日前" },
      { name: "株式会社Oプロダクツ", time: "3日前" },
    ],
  },
  low: {
    label: "インテントスコア：低",
    gradient: "from-emerald-900 to-slate-900",
    glowColor: "shadow-emerald-900/10",
    iconBg: "bg-emerald-900",
    leads: 132,
    action: "送信から1週間以上経過または未開封",
    companies: [
      { name: "Pコミュニケーションズ株式会社", time: "5日前" },
      { name: "株式会社Qデザイン", time: "1週間前" },
      { name: "Rトレーディング株式会社", time: "1週間前" },
      { name: "株式会社Sラボ", time: "2週間前" },
      { name: "Tソリューション合同会社", time: "2週間前" },
      { name: "株式会社Uリンクス", time: "3週間前" },
      { name: "Vプランニング株式会社", time: "1ヶ月前" },
      { name: "株式会社Wイノベーション", time: "1ヶ月前" },
    ],
  },
};

function ScoreCard({
  level,
  isVisible,
  delay,
}: {
  level: ScoreLevel;
  isVisible: boolean;
  delay: number;
}) {
  const config = scoreConfig[level];
  const isHigh = level === "high";

  return (
    <div
      className={`reveal-on-scroll group relative bg-white rounded-2xl overflow-hidden transition-all duration-500 hover:-translate-y-1 ${isVisible ? "is-visible" : ""} ${isHigh ? "ring-2 ring-emerald-200" : ""}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* グローエフェクト */}
      <div
        className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${config.glowColor} shadow-2xl`}
      />

      {/* ヘッダー */}
      <div className={`relative bg-gradient-to-r ${config.gradient} px-5 py-4`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white tracking-wide text-shadow-sm">
            {config.label}
          </span>
          {isHigh && (
            <span className="flex items-center gap-1 text-xs text-emerald-900 bg-white/90 px-2 py-0.5 rounded-full font-bold shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              HOT
            </span>
          )}
        </div>
      </div>

      {/* コンテンツ */}
      <div className="relative p-5 border border-t-0 border-slate-100 rounded-b-2xl">
        {/* リード数 */}
        <div className="mb-5">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-slate-900">
              {config.leads}
            </span>
            <span className="text-lg text-slate-500">件のリード</span>
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100">
            <svg
              className="w-3.5 h-3.5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-xs text-slate-600">{config.action}</span>
          </div>
        </div>

        {/* 企業リスト */}
        <div className="space-y-2">
          {config.companies.map((company, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer group/item"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-2 h-2 rounded-full ${config.iconBg} flex-shrink-0`}
                ></div>
                <span className="text-sm text-slate-700 truncate">
                  {company.name}
                </span>
              </div>
              <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                {company.time}
              </span>
            </div>
          ))}
        </div>

        {/* アクションボタン */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <button
            className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
              isHigh
                ? "bg-gradient-to-r from-emerald-400 to-emerald-500 text-white hover:shadow-lg hover:shadow-emerald-500/25"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {isHigh ? "今すぐアプローチ" : "詳細を見る"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function IntentScore() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 },
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="intent-score"
      className="py-24 bg-slate-50 relative overflow-hidden"
      ref={ref}
    >
      {/* 背景デコレーション */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-emerald-100 rounded-full blur-3xl opacity-30" />
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-teal-100 rounded-full blur-3xl opacity-30" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 relative z-10">
        {/* ヘッダー */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
          <span className="inline-block rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-600 tracking-wide uppercase mb-4">
            Intent Analysis
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 md:text-4xl lg:text-5xl">
            インテント取得・分析
          </h2>
          <p className="mt-4 sm:mt-6 text-sm sm:text-base md:text-lg text-slate-600 leading-relaxed px-2">
            送付した資料の開封状況をリアルタイムで追跡。
            <br className="hidden md:block" />
            反応の速さでリードの温度感を3段階に分類し、
            <br className="hidden md:block" />
            優先的にアプローチすべき企業を可視化します。
          </p>
        </div>

        {/* AIインサイト */}
        <div className="max-w-3xl mx-auto mb-10 sm:mb-14">
          <div className="relative bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl shadow-emerald-500/20 overflow-hidden">
            {/* パターン */}
            <div className="absolute inset-0 opacity-10">
              <svg
                className="w-full h-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <defs>
                  <pattern
                    id="grid"
                    width="10"
                    height="10"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 10 0 L 0 0 0 10"
                      fill="none"
                      stroke="white"
                      strokeWidth="0.5"
                    />
                  </pattern>
                </defs>
                <rect width="100" height="100" fill="url(#grid)" />
              </svg>
            </div>

            <div className="relative flex items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 sm:w-6 sm:h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-white text-base sm:text-lg mb-1 sm:mb-2">
                  AIインサイト
                </h3>
                <p className="text-white/90 text-sm sm:text-base leading-relaxed">
                  これらのリードは強い行動シグナルを示しています。コンバージョン率を最大化するために
                  <span className="font-bold text-yellow-300"> 3日以内</span>
                  に優先的にアプローチしてください。 高スコアのリードは平均
                  <span className="font-bold text-yellow-300">3.2倍</span>
                  の成約率を記録しています。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* スコアカード */}
        <div className="grid gap-6 lg:gap-8 md:grid-cols-3">
          <ScoreCard level="high" isVisible={isVisible} delay={0} />
          <ScoreCard level="medium" isVisible={isVisible} delay={150} />
          <ScoreCard level="low" isVisible={isVisible} delay={300} />
        </div>
      </div>
    </section>
  );
}
