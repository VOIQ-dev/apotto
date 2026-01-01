"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

const navItems = [
  { href: "#features", label: "機能" },
  { href: "#how-it-works", label: "使い方" },
  { href: "#intent-score", label: "インテント分析" },
  { href: "#data-analysis", label: "データ分析" },
  { href: "#strengths", label: "強み" },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // モバイルメニューが開いているときはスクロールを無効化
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled || isMobileMenuOpen
          ? "bg-white/80 backdrop-blur-xl shadow-sm border-b border-slate-200/50 py-3"
          : "bg-transparent py-6"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center group">
          <Image
            src="/apotto/apotto_icon.png"
            alt="apotto"
            width={96}
            height={96}
            className="h-16 sm:h-24 w-auto transition-transform duration-300 group-hover:scale-105"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1 p-1 rounded-full bg-slate-100/50 border border-slate-200/50 backdrop-blur-sm">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-5 py-2 text-sm font-bold text-slate-800 rounded-full transition-all duration-300 hover:text-white hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/30"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* CTA Buttons + Mobile Menu Button */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="#contact"
            className="hidden sm:inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white/50 px-5 text-sm font-semibold text-slate-700 backdrop-blur-sm transition-all hover:bg-white hover:border-slate-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            資料ダウンロード
          </Link>
          <Link
            href="#contact"
            className="relative inline-flex h-9 sm:h-10 items-center justify-center overflow-hidden rounded-full bg-slate-900 px-4 sm:px-6 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-all hover:bg-slate-800 hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 active:scale-95"
          >
            <span className="relative z-10">無料デモ</span>
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-0 transition-opacity duration-300 hover:opacity-20" />
          </Link>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            aria-label="メニューを開く"
          >
            {isMobileMenuOpen ? (
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={`lg:hidden fixed inset-x-0 top-[72px] sm:top-[96px] bottom-0 z-[100] bg-slate-50 border-t border-slate-200 shadow-2xl transition-all duration-300 ${
          isMobileMenuOpen ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
      >
        <nav className="flex flex-col p-6 space-y-2 bg-slate-50">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-4 py-3 text-base font-bold text-slate-800 rounded-xl transition-all duration-300 hover:bg-emerald-50 hover:text-emerald-600"
            >
              {item.label}
            </a>
          ))}
          <div className="pt-4 border-t border-slate-100">
            <Link
              href="#contact"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block w-full text-center px-6 py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-colors"
            >
              資料ダウンロード / 無料デモ
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
