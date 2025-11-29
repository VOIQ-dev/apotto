'use client';

import { useEffect, useRef, useState } from 'react';

type ScoreLevel = 'high' | 'medium' | 'low';

const scoreConfig: Record<ScoreLevel, { 
  label: string; 
  gradient: string; 
  glowColor: string;
  iconBg: string;
  leads: number; 
  action: string; 
  companies: { name: string; time: string }[] 
}> = {
  high: {
    label: 'インテントスコア：高',
    gradient: 'from-rose-500 to-pink-600',
    glowColor: 'shadow-rose-500/20',
    iconBg: 'bg-rose-500',
    leads: 13,
    action: '24時間以内にアクションあり',
    companies: [
      { name: 'テクノフューチャー株式会社', time: '2分前' },
      { name: 'グローバルネクスト株式会社', time: '15分前' },
      { name: 'イノベーションラボ株式会社', time: '32分前' },
      { name: 'スマートソリューションズ株式会社', time: '1時間前' },
      { name: 'デジタルブリッジ株式会社', time: '3時間前' },
      { name: 'クラウドワークス株式会社', time: '5時間前' },
      { name: 'アドバンステック株式会社', time: '8時間前' },
    ],
  },
  medium: {
    label: 'インテントスコア：中',
    gradient: 'from-amber-400 to-orange-500',
    glowColor: 'shadow-amber-500/20',
    iconBg: 'bg-amber-500',
    leads: 24,
    action: '72時間以内にアクションあり',
    companies: [
      { name: 'ビジネスクリエイト株式会社', time: '1日前' },
      { name: 'プライムパートナーズ株式会社', time: '1日前' },
      { name: 'サステナブルテック株式会社', time: '2日前' },
      { name: 'フロンティアシステム株式会社', time: '2日前' },
      { name: 'ネクストジェネレーション株式会社', time: '2日前' },
      { name: 'エコソリューション株式会社', time: '3日前' },
      { name: 'インテグレートシステム株式会社', time: '3日前' },
      { name: 'データドリブン株式会社', time: '3日前' },
    ],
  },
  low: {
    label: 'インテントスコア：低',
    gradient: 'from-slate-400 to-slate-500',
    glowColor: 'shadow-slate-500/10',
    iconBg: 'bg-slate-400',
    leads: 132,
    action: 'アクションから73時間以上経過',
    companies: [
      { name: 'レガシーホールディングス株式会社', time: '5日前' },
      { name: 'トラディショナル商事株式会社', time: '1週間前' },
      { name: 'スタンダードサービス株式会社', time: '1週間前' },
      { name: 'ベーシックインダストリー株式会社', time: '2週間前' },
      { name: 'コンベンショナル株式会社', time: '2週間前' },
      { name: 'クラシックエンタープライズ株式会社', time: '3週間前' },
      { name: 'オールドスタイル株式会社', time: '1ヶ月前' },
      { name: 'ヘリテージグループ株式会社', time: '1ヶ月前' },
    ],
  },
};

function ScoreCard({ level, isVisible, delay }: { level: ScoreLevel; isVisible: boolean; delay: number }) {
  const config = scoreConfig[level];
  const isHigh = level === 'high';

  return (
    <div
      className={`reveal-on-scroll group relative bg-white rounded-2xl overflow-hidden transition-all duration-500 hover:-translate-y-1 ${isVisible ? 'is-visible' : ''} ${isHigh ? 'ring-2 ring-rose-200' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* グローエフェクト */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${config.glowColor} shadow-2xl`} />
      
      {/* ヘッダー */}
      <div className={`relative bg-gradient-to-r ${config.gradient} px-5 py-4`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white tracking-wide">{config.label}</span>
          {isHigh && (
            <span className="flex items-center gap-1 text-xs text-white/90 bg-white/20 px-2 py-0.5 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
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
            <span className="text-4xl font-bold text-slate-900">{config.leads}</span>
            <span className="text-lg text-slate-500">件のリード</span>
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                <div className={`w-2 h-2 rounded-full ${config.iconBg} flex-shrink-0`}></div>
                <span className="text-sm text-slate-700 truncate">{company.name}</span>
              </div>
              <span className="text-xs text-slate-400 flex-shrink-0 ml-2">{company.time}</span>
            </div>
          ))}
        </div>

        {/* アクションボタン */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <button className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
            isHigh 
              ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white hover:shadow-lg hover:shadow-rose-500/25' 
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}>
            {isHigh ? '今すぐアプローチ' : '詳細を見る'}
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
      { threshold: 0.1 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="intent-score" className="py-24 bg-slate-50 relative overflow-hidden" ref={ref}>
      {/* 背景デコレーション */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-rose-100 rounded-full blur-3xl opacity-30" />
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-amber-100 rounded-full blur-3xl opacity-30" />
      </div>

      <div className="mx-auto max-w-7xl px-6 relative z-10">
        {/* ヘッダー */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-flex items-center gap-2 text-emerald-600 text-sm font-semibold tracking-wide uppercase mb-4 bg-emerald-50 px-4 py-1.5 rounded-full">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Intent Analysis
          </span>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            インテント取得・分析
          </h2>
          <p className="mt-6 text-lg text-slate-600 leading-relaxed">
            送付した資料の開封状況をリアルタイムで追跡。<br className="hidden sm:block" />
            反応の速さでリードの温度感を3段階に分類し、<br className="hidden sm:block" />
            優先的にアプローチすべき企業を可視化します。
          </p>
        </div>

        {/* AIインサイト */}
        <div className="max-w-3xl mx-auto mb-14">
          <div className="relative bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 shadow-xl shadow-emerald-500/20 overflow-hidden">
            {/* パターン */}
            <div className="absolute inset-0 opacity-10">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100" height="100" fill="url(#grid)" />
              </svg>
            </div>
            
            <div className="relative flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-white text-lg mb-2">AIインサイト</h3>
                <p className="text-white/90 leading-relaxed">
                  これらのリードは強い行動シグナルを示しています。コンバージョン率を最大化するために
                  <span className="font-bold text-yellow-300"> 24時間以内</span>に優先的にアプローチしてください。
                  高スコアのリードは平均<span className="font-bold text-yellow-300">3.2倍</span>の成約率を記録しています。
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

        {/* 補足説明 */}
        <div className="mt-14 flex flex-wrap justify-center gap-4">
          <div className="flex items-center gap-2.5 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-100">
            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-rose-500 to-pink-600"></div>
            <span className="text-sm text-slate-600 font-medium">高：即アクション推奨</span>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-100">
            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-amber-400 to-orange-500"></div>
            <span className="text-sm text-slate-600 font-medium">中：フォローアップ推奨</span>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-100">
            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-slate-400 to-slate-500"></div>
            <span className="text-sm text-slate-600 font-medium">低：再アプローチ検討</span>
          </div>
        </div>
      </div>
    </section>
  );
}

