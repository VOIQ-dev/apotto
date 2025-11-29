'use client';

import { useEffect, useRef, useState } from 'react';

// カレンダー表示コンポーネント（静的）
function CalendarDisplay() {
  // アポイントスロットのデータ（固定表示）
  const appointments = [
    { day: '月', time: '10:00', company: 'A社' },
    { day: '火', time: '14:00', company: 'B社' },
    { day: '水', time: '11:00', company: 'C社' },
    { day: '木', time: '15:00', company: 'D社' },
    { day: '金', time: '13:00', company: 'E社' },
  ];

  const days = ['月', '火', '水', '木', '金'];
  const times = ['10:00', '11:00', '13:00', '14:00', '15:00'];

  return (
    <div className="p-6 bg-slate-50">
      {/* カレンダーヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-semibold text-slate-700">今週のスケジュール</span>
        </div>
      </div>

      {/* カレンダーグリッド */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-5 border-b border-slate-100">
          {days.map((day) => (
            <div key={day} className="py-2 text-center text-xs font-medium text-slate-500 bg-slate-50">
              {day}
            </div>
          ))}
        </div>

        {/* タイムスロット */}
        <div className="grid grid-cols-5">
          {days.map((day) => (
            <div key={day} className="border-r border-slate-100 last:border-r-0">
              {times.map((time) => {
                const appointment = appointments.find(
                  (a) => a.day === day && a.time === time
                );

                return (
                  <div
                    key={`${day}-${time}`}
                    className={`h-12 border-b border-slate-50 last:border-b-0 flex items-center justify-center ${
                      appointment ? 'bg-emerald-50' : ''
                    }`}
                  >
                    {appointment ? (
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-semibold text-emerald-600">{appointment.company}</span>
                        <span className="text-[9px] text-emerald-500">{time}</span>
                      </div>
                    ) : (
                      <div className="w-1 h-1 rounded-full bg-slate-200"></div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 統計 */}
      <div className="mt-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span className="text-slate-500">今週のアポイント</span>
        </div>
        <span className="font-semibold text-emerald-600">{appointments.length}件</span>
      </div>
    </div>
  );
}

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
        <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 border-emerald-200 bg-white text-lg font-bold text-emerald-500 shadow-lg shadow-emerald-200/60 z-10 group">
          {number}
          {/* Pulse effect behind number */}
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-75 group-hover:opacity-100"></div>
        </div>
        {!isLast && (
          <div className="relative h-full w-0.5 bg-slate-200 my-4 overflow-hidden rounded-full">
             <div className="absolute top-0 left-0 w-full h-1/2 bg-primary animate-draw-line"></div>
          </div>
        )}
      </div>
      <div className="pb-16 pt-1 flex-1">
        <h3 className="text-xl font-bold text-slate-900">{title}</h3>
        <p className="mt-3 text-slate-600">{description}</p>
        {image && (
          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm group hover:shadow-md transition-shadow duration-300">
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
           <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
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
                <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow border border-slate-100 transform transition-transform group-hover:scale-[1.02] duration-300">
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
            title="AIが文面を自動生成・自動送付"
            description="アップロードされたURLから企業の事業内容を解析。自社プロダクトとの相性を考え、刺さる提案文を1社ずつ生成します。"
            image={
               <div className="relative p-6 bg-slate-900/5">
                 <div className="absolute top-4 right-4 flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce"></div>
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce delay-100"></div>
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce delay-200"></div>
                 </div>
                 <div className="bg-white rounded-lg p-4 shadow-sm text-sm text-slate-700 leading-relaxed border border-slate-200 transform transition-transform group-hover:translate-y-[-4px] duration-300">
                    <p>
                       <span className="bg-yellow-100 text-yellow-800 px-1 rounded">御社のDX推進事例</span>を拝見し、特に〇〇の取り組みに感銘を受けました。弊社のAIツールであれば、その課題をさらに...
                    </p>
                 </div>
               </div>
            }
          />
          <StepItem
            number="03"
            title="アポイントを待つだけ"
            description="あとは自動でアプローチが実行され、アポイントの連絡を待つだけ。カレンダーにスケジュールが埋まっていきます。"
            isLast
            image={<CalendarDisplay />}
          />
        </div>
      </div>
    </section>
  );
}
