'use client';

import { useEffect, useRef, useState } from 'react';

function StepItem({
  number,
  title,
  description,
  image,
  isLast,
}: {
  number: string;
  title: string;
  description: string;
  image?: React.ReactNode;
  isLast?: boolean;
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
      { threshold: 0.2 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal-on-scroll relative flex gap-8 md:gap-12 ${
        isVisible ? 'is-visible' : ''
      }`}
    >
      <div className="flex flex-col items-center">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-lg font-bold text-primary shadow-lg shadow-primary/20 z-10">
          {number}
        </div>
        {!isLast && (
          <div className="h-full w-0.5 bg-gradient-to-b from-primary to-border my-4" />
        )}
      </div>
      <div className="pb-16 pt-1 flex-1">
        <h3 className="text-xl font-bold text-foreground">{title}</h3>
        <p className="mt-3 text-muted-foreground">{description}</p>
        {image && (
          <div className="mt-6 overflow-hidden rounded-xl border border-border bg-slate-50 shadow-sm">
            {image}
          </div>
        )}
      </div>
    </div>
  );
}

export function Steps() {
  return (
    <section id="how-it-works" className="py-24 bg-white">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-16 text-center">
           <span className="text-sm font-semibold uppercase tracking-wider text-primary">How it works</span>
           <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            たった3ステップで、<br/>アプローチを開始
          </h2>
        </div>

        <div className="mt-10">
          <StepItem
            number="01"
            title="リストをアップロード"
            description="アプローチしたい企業のリスト（Excel/CSV）をドラッグ＆ドロップでアップロード。基本情報とURLさえあればOKです。"
            image={
              <div className="flex items-center justify-center p-8 bg-slate-50/50">
                <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow border border-slate-100">
                   <div className="flex items-center gap-3 mb-4 border-b border-slate-50 pb-3">
                      <div className="h-8 w-8 rounded bg-green-100 flex items-center justify-center text-green-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <div className="text-sm font-medium text-slate-700">company_list.xlsx</div>
                   </div>
                   <div className="space-y-2">
                      <div className="h-2 bg-slate-100 rounded w-3/4"></div>
                      <div className="h-2 bg-slate-100 rounded w-full"></div>
                      <div className="h-2 bg-slate-100 rounded w-5/6"></div>
                   </div>
                </div>
              </div>
            }
          />
          <StepItem
            number="02"
            title="AIが文面を自動生成"
            description="アップロードされたURLから企業の事業内容を解析。自社プロダクトとの相性を考え、刺さる提案文を1社ずつ生成します。"
            image={
               <div className="relative p-6 bg-slate-900/5">
                 <div className="absolute top-4 right-4 flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce"></div>
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce delay-100"></div>
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce delay-200"></div>
                 </div>
                 <div className="bg-white rounded-lg p-4 shadow-sm text-sm text-slate-700 leading-relaxed border border-slate-200">
                    <p>
                       <span className="bg-yellow-100 text-yellow-800 px-1 rounded">御社のDX推進事例</span>を拝見し、特に〇〇の取り組みに感銘を受けました。弊社のAIツールであれば、その課題をさらに...
                    </p>
                 </div>
               </div>
            }
          />
          <StepItem
            number="03"
            title="クリック送信 & 分析"
            description="生成された文面を確認し、ワンクリックで送信（またはメールソフトへコピー）。送信後は相手の開封やクリックをリアルタイムで追跡します。"
            isLast
            image={
               <div className="grid grid-cols-2 gap-4 p-6 bg-slate-50">
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-100 text-center">
                     <div className="text-xs text-slate-500 uppercase">Open Rate</div>
                     <div className="text-2xl font-bold text-slate-900 mt-1">42.8%</div>
                     <div className="text-xs text-green-500 mt-1">↑ 12% up</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-100 text-center">
                     <div className="text-xs text-slate-500 uppercase">Meetings</div>
                     <div className="text-2xl font-bold text-slate-900 mt-1">8</div>
                     <div className="text-xs text-slate-400 mt-1">This week</div>
                  </div>
               </div>
            }
          />
        </div>
      </div>
    </section>
  );
}

