'use client';

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

export function IntroVideo() {
  return (
    <section className="py-24 bg-gradient-to-b from-white via-slate-50 to-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <span className="inline-block rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-600 tracking-wide uppercase mb-4">
            Introduction Video
          </span>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            apottoで変わる営業活動
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            1分でわかる、新しい営業の形
          </p>
        </div>

        <div className="mx-auto max-w-5xl">
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
              controls
              loop
            />
          </div>
        </div>
      </div>
    </section>
  );
}
