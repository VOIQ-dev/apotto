'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled
          ? 'bg-white/80 backdrop-blur-xl shadow-sm border-b border-slate-200/50 py-3'
          : 'bg-transparent py-6'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center group">
          <Image
            src="/apotto/apotto_icon.png"
            alt="apotto"
            width={96}
            height={96}
            className="h-24 w-auto transition-transform duration-300 group-hover:scale-105"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1 p-1 rounded-full bg-slate-100/50 border border-slate-200/50 backdrop-blur-sm">
          {[
            { href: '#features', label: '機能' },
            { href: '#how-it-works', label: '使い方' },
            { href: '#intent-score', label: 'インテント分析' },
            { href: '#data-analysis', label: 'データ分析' },
            { href: '#strengths', label: '強み' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-5 py-2 text-sm font-bold text-slate-800 rounded-full transition-all duration-300 hover:text-white hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/30"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* CTA Buttons */}
        <div className="flex items-center gap-3">
          <Link
            href="#contact"
            className="hidden sm:inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white/50 px-5 text-sm font-semibold text-slate-700 backdrop-blur-sm transition-all hover:bg-white hover:border-slate-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            資料ダウンロード
          </Link>
          <Link
            href="#contact"
            className="relative inline-flex h-10 items-center justify-center overflow-hidden rounded-full bg-slate-900 px-6 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-all hover:bg-slate-800 hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 active:scale-95"
          >
            <span className="relative z-10">無料デモ</span>
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-0 transition-opacity duration-300 hover:opacity-20" />
          </Link>
        </div>
      </div>
    </header>
  );
}
