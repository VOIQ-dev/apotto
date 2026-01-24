"use client";

import Image from "next/image";
import dynamic from 'next/dynamic';

// Dynamically import Player to avoid SSR issues
const Player = dynamic(
  () => import('@remotion/player').then((mod) => mod.Player),
  { ssr: false }
);

const ApottoIntroVideo = dynamic(
  () => import('../../../remotion/src/ApottoIntroVideo').then((mod) => ({ default: mod.ApottoIntroVideo })),
  { ssr: false }
);

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 pb-12 sm:pt-32 md:pt-48 md:pb-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 text-center relative z-10">
        {/* ロゴを文言の右上に配置 */}
        <div className="relative inline-block">
          <Image
            src="/apotto/apotto_logo.png"
            alt="apotto Logo"
            width={320}
            height={160}
            className="absolute -top-8 -right-32 h-40 w-80 hidden lg:block"
            loading="eager"
            style={{ width: "auto", height: "auto" }}
          />
          <h1 className="mt-6 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 md:text-6xl lg:text-7xl animate-fade-in-up delay-100">
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700">
              24時間365日
            </span>
            <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500 drop-shadow-[0_0_30px_rgba(52,211,153,0.3)]">
              AIが商談を探し続ける
            </span>
          </h1>
        </div>

        <p className="mx-auto mt-4 max-w-4xl text-sm sm:text-base md:text-lg leading-6 sm:leading-7 text-slate-600 animate-fade-in-up delay-200 px-2">
          完全にパーソナライズされた文面をAIが自動生成・自動送信。インテント解析で商談見込みの高い企業を自動抽出する新しい営業AIエージェントです。
          <br className="hidden md:inline" />
          <span className="text-slate-900 font-semibold">
            新規開拓をラクに強く。営業のムダはすべて減ります。
          </span>
        </p>

        {/* Remotion Video Player */}
        <div className="mt-10 sm:mt-16 md:mt-20 mx-auto max-w-5xl animate-fade-in-up delay-400">
          <div className="rounded-2xl overflow-hidden shadow-2xl border border-slate-200 bg-slate-900">
            <Player
              component={ApottoIntroVideo}
              durationInFrames={1800}
              compositionWidth={1920}
              compositionHeight={1080}
              fps={30}
              style={{
                width: '100%',
                aspectRatio: '16/9',
              }}
              controls={false}
              loop
              autoPlay
            />
          </div>
        </div>
      </div>
    </section>
  );
}
