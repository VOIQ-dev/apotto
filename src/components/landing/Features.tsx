'use client';

import { useEffect, useRef, useState } from 'react';

function FeatureCard({
  title,
  description,
  icon,
  delay = 0,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  delay?: number;
}) {
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
    <div
      ref={ref}
      className={`reveal-on-scroll rounded-2xl border border-border/60 bg-white p-8 shadow-sm transition-all hover:shadow-lg hover:border-primary/20 ${
        isVisible ? 'is-visible' : ''
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-foreground">{title}</h3>
      <p className="mt-4 text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="py-24 bg-slate-50/50 relative">
      {/* Decoration */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-border to-transparent"></div>
      
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            最強の営業チームを、<br/>
            AIひとつで。
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            apottoは単なる自動送信ツールではありません。<br/>
            相手の心を動かす「文面」と、興味を見逃さない「分析」を兼ね備えています。
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <FeatureCard
            title="AIハイパーパーソナライズ"
            description="相手企業のWebサイトを解析し、その企業に特化した提案文をAIが自動生成。「コピペ営業」からの脱却を実現します。"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            }
            delay={0}
          />
          <FeatureCard
            title="PDF閲覧トラッキング"
            description="送信した資料の「どのページ」が「どれくらい」読まれたかを可視化。興味の度合いを数値化し、追撃の優先度を判断できます。"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            delay={150}
          />
          <FeatureCard
            title="Excel一括取り込み & 自動化"
            description="リストをExcelでアップロードするだけで、最大100社へのアプローチ準備が完了。面倒な作業はすべて自動化し、コア業務に集中できます。"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            }
            delay={300}
          />
        </div>
      </div>
    </section>
  );
}

