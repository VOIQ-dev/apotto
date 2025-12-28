'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const companyLogos = [
  { src: '/companyLogo/Green_logo_colored.svg', alt: 'Green' },
  { src: '/companyLogo/Heroz_logotype_l.png', alt: 'HEROZ' },
  { src: '/companyLogo/MIL_logo_black.png', alt: 'MIL' },
  { src: '/companyLogo/Vario_logo.png', alt: 'Vario' },
  { src: '/companyLogo/VOST_LOGO.png', alt: 'VOST' },
];

const stats = [
  { value: '200', unit: '件以上', label: 'プロジェクト支援実績' },
  { value: '3.2', unit: '万件以上', label: '創出した商談件数' },
  { value: '60', unit: '業界以上', label: '対応した業界カテゴリ' },
];

export function Strengths() {
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
    <section id="strengths" className="py-24 bg-gradient-to-b from-slate-50 to-white relative overflow-hidden" ref={ref}>
      {/* 背景デコレーション */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent"></div>
      </div>

      <div className="mx-auto max-w-7xl px-6 relative z-10">
        {/* ヘッダー */}
        <div className={`text-center max-w-3xl mx-auto mb-16 reveal-on-scroll ${isVisible ? 'is-visible' : ''}`}>
          <span className="inline-block rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-600 tracking-wide uppercase mb-4">
            Our Strengths
          </span>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            apottoの強み
          </h2>
          <p className="mt-6 text-lg text-slate-600 leading-relaxed">
            インサイドセールス特化型の専門チームが、<br className="hidden sm:block" />
            現場で蓄積してきた<span className="font-semibold text-slate-900">数百万件の営業データ</span>から設計
          </p>
        </div>

        {/* 実績数値 */}
        <div className="mb-16">
          <h3 className="text-center text-xl font-bold text-slate-900 mb-8">
            インサイドセールス支援実績
          </h3>
          <div className="grid gap-6 md:grid-cols-3">
            {stats.map((stat, index) => (
            <div
              key={index}
              className={`reveal-on-scroll text-center p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-lg hover:border-emerald-200 transition-all ${isVisible ? 'is-visible' : ''}`}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <div className="flex items-baseline justify-center gap-1 mb-2">
                <span className="text-5xl font-bold text-emerald-600">{stat.value}</span>
                <span className="text-xl font-semibold text-slate-700">{stat.unit}</span>
              </div>
              <p className="text-slate-600 font-medium">{stat.label}</p>
            </div>
          ))}
          </div>
        </div>

        {/* 導入企業ロゴ */}
        <div className={`reveal-on-scroll ${isVisible ? 'is-visible' : ''}`} style={{ transitionDelay: '300ms' }}>
          <p className="text-center text-sm font-semibold text-slate-500 uppercase tracking-wider mb-8">
            インサイドセールス支援企業
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 mb-16">
            {companyLogos.map((logo, index) => (
              <div
                key={index}
                className="grayscale hover:grayscale-0 opacity-60 hover:opacity-100 transition-all duration-300"
              >
                <img
                  src={logo.src}
                  alt={logo.alt}
                  className="h-10 md:h-12 w-auto object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

