"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useCallback } from "react";

type AnimationStep =
  | "idle" // 0. 待機状態
  | "uploading" // 1. ファイルドロップ & アップロード
  | "analyzing" // 2. 解析中 (プログレスバー)
  | "generating" // 3. AI生成 (タイピング)
  | "filling" // 4. フォーム自動入力
  | "logging"; // 5. 送信完了ログ

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const stepList: { id: AnimationStep; label: string; description: string }[] = [
  {
    id: "uploading",
    label: "List Upload",
    description: "リストをアップロード",
  },
  { id: "analyzing", label: "AI Analysis", description: "企業情報をAI解析" },
  { id: "generating", label: "Message Gen", description: "文面を自動生成" },
  { id: "filling", label: "Auto Fill", description: "フォーム自動入力" },
  { id: "logging", label: "Complete", description: "送信完了・ログ" },
];

export function Hero() {
  const [step, setStep] = useState<AnimationStep>("idle");
  const [isRunning, setIsRunning] = useState(false);

  // アップロード進捗 (0-100)
  const [uploadProgress, setUploadProgress] = useState(0);

  // 生成テキスト
  const [typedText, setTypedText] = useState("");
  const fullText =
    "貴社の「持続可能な社会の実現」という理念に深く共感いたしました。特に、最近の環境配慮型素材への転換は素晴らしい取り組みだと感じております。弊社のAIソリューションであれば、その生産効率をさらに...";

  // フォーム入力値
  const [formValues, setFormValues] = useState({
    name: "",
    company: "",
    email: "",
  });

  // ログ表示用
  const [logEntry, setLogEntry] = useState<{
    company: string;
    contact: string;
    time: string;
  } | null>(null);

  const logVisible = Boolean(logEntry) && step === "logging";
  const logCompany = logEntry?.company ?? "株式会社エコロジー";
  const logContact = logEntry?.contact ?? "環境 太郎";
  const logTime = logEntry?.time ?? "09:42";

  // アニメーション実行（一度だけ）
  const runAnimation = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);

    // リセット
    setUploadProgress(0);
    setTypedText("");
    setFormValues({ name: "", company: "", email: "" });
    setLogEntry(null);

    // 1. Upload Phase（ゆっくり）
    setStep("uploading");
    for (let i = 0; i <= 100; i += 2) {
      setUploadProgress(i);
      await sleep(40);
    }
    await sleep(800);

    // 2. Analyzing Phase（ゆっくり）
    setStep("analyzing");
    await sleep(2500);

    // 3. Generating Phase（高速化）
    setStep("generating");
    for (let i = 0; i < fullText.length; i++) {
      setTypedText((prev) => prev + fullText.charAt(i));
      await sleep(25); // 20ms -> 25ms (微調整)
    }
    await sleep(800); // 500ms -> 800ms (完了の余韻を持たせる)

    // 4. Filling Phase（ゆっくり）
    setStep("filling");
    const targetValues = {
      company: "株式会社エコロジー",
      name: "環境 太郎",
      email: "kankyo@ecology.co.jp",
    };

    setFormValues((prev) => ({ ...prev, company: targetValues.company }));
    await sleep(600);
    setFormValues((prev) => ({ ...prev, name: targetValues.name }));
    await sleep(600);
    setFormValues((prev) => ({ ...prev, email: targetValues.email }));
    await sleep(1000);

    // 5. Logging Phase
    setStep("logging");
    setLogEntry({
      company: targetValues.company,
      contact: targetValues.name,
      time: new Date().toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
    await sleep(2500);

    // 6. 完了 - 直接 idle に戻る
    setLogEntry(null);
    setStep("idle");
    setIsRunning(false);
  }, [isRunning, fullText]);

  // 現在のステップインデックスを取得（idle時は -1）
  const currentStepIndex =
    step === "idle" ? -1 : stepList.findIndex((s) => s.id === step);

  // モバイル表示用の現在のステップ情報
  const currentStepInfo =
    currentStepIndex >= 0 ? stepList[currentStepIndex] : null;

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

        {/* Hero Image / Dashboard Preview */}
        <div className="mt-10 sm:mt-16 md:mt-20 relative animate-fade-in-up delay-400 perspective-1000">
          {/* ステップ表示 */}
          <div className="mb-4 sm:mb-8 flex justify-center px-2">
            <div
              className="relative flex items-center gap-3 sm:gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 backdrop-blur-xl border border-white/10 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3 sm:py-4 shadow-2xl w-full max-w-[420px] min-h-[72px] sm:min-h-[88px]"
              style={{
                boxShadow: currentStepInfo
                  ? "0 25px 50px -12px rgba(16, 185, 129, 0.2)"
                  : undefined,
              }}
            >
              {/* 左側: STEPバッジ / DEMOアイコン */}
              <div className="flex flex-col items-center w-10 sm:w-14 flex-shrink-0">
                <span
                  className={`text-[8px] sm:text-[10px] font-bold tracking-widest mb-1 ${currentStepInfo ? "text-emerald-400" : "text-slate-400"}`}
                >
                  {currentStepInfo ? "STEP" : "DEMO"}
                </span>
                <div className="relative">
                  {currentStepInfo ? (
                    <>
                      <span className="flex items-center justify-center w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-lg sm:text-xl font-bold shadow-lg shadow-emerald-500/40">
                        {currentStepIndex + 1}
                      </span>
                      <span className="absolute -inset-1 rounded-lg sm:rounded-xl bg-emerald-500/20 animate-ping opacity-50"></span>
                    </>
                  ) : (
                    <div className="flex items-center justify-center w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-slate-700 text-slate-400">
                      <svg
                        className="w-5 h-5 sm:w-6 sm:h-6"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              {/* 区切り線 */}
              <div className="w-px h-10 sm:h-12 bg-gradient-to-b from-transparent via-white/20 to-transparent flex-shrink-0"></div>

              {/* 右側: 説明 */}
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm sm:text-lg font-bold text-white truncate">
                  {currentStepInfo
                    ? currentStepInfo.description
                    : "AIの自動営業フローを体験"}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  {currentStepInfo ? (
                    <>
                      <div className="flex gap-1">
                        {stepList.map((_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-300 ${i <= currentStepIndex ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-slate-600"}`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] sm:text-xs text-slate-400 ml-1">
                        {currentStepIndex + 1} / {stepList.length}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs sm:text-sm text-slate-400">
                      5つのステップを順に解説します
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="relative mx-auto max-w-5xl rounded-xl sm:rounded-2xl border border-white/10 bg-slate-900/40 p-1 sm:p-2 backdrop-blur-xl shadow-2xl shadow-emerald-500/10 ring-1 ring-white/5 transform sm:rotate-x-2 transition-transform duration-500 hover:rotate-x-0">
            <div className="rounded-lg sm:rounded-xl border border-white/10 bg-slate-950/80 overflow-hidden flex flex-col h-full min-h-[400px] sm:min-h-[550px]">
              {/* Window Header */}
              <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-white/10 bg-slate-900/50">
                <div className="flex gap-1 sm:gap-1.5">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-red-500/80"></div>
                  <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-amber-500/80"></div>
                  <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-emerald-500/80"></div>
                </div>
                <div className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1/3 h-6 rounded-md bg-white/5 text-[10px] items-center justify-center text-slate-400 font-mono border border-white/5">
                  apotto.ai/campaigns/new
                </div>
                <div className="w-8 sm:w-16"></div>
              </div>

              {/* App UI Mockup */}
              <div className="flex flex-1 bg-slate-950 overflow-hidden relative">
                {/* Overlay for File Drop Animation */}
                {step === "uploading" && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/60 backdrop-blur-[4px] animate-fade-in p-4">
                    <div className="flex flex-col items-center justify-center p-4 sm:p-8 rounded-xl sm:rounded-2xl bg-slate-900 shadow-2xl border-2 border-dashed border-emerald-500/30 w-full max-w-[320px] ring-1 ring-white/10">
                      <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4 sm:mb-6 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                        <svg
                          className="w-7 h-7 sm:w-10 sm:h-10"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                      </div>
                      <p className="text-base sm:text-xl font-bold text-slate-200 mb-2">
                        企業リストを解析中
                      </p>
                      <p className="text-xs sm:text-sm text-slate-500 mb-4 sm:mb-6">
                        target_companies.csv
                      </p>
                      <div className="w-full max-w-[200px] sm:max-w-[256px] h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-100 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Idle State Overlay */}
                {step === "idle" && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                    <div className="text-center">
                      <button
                        onClick={runAnimation}
                        className="group relative w-16 h-16 sm:w-24 sm:h-24 mx-auto rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 flex items-center justify-center mb-4 sm:mb-6 text-emerald-400 transition-all duration-300 hover:scale-110 cursor-pointer ring-1 ring-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.1)] hover:shadow-[0_0_50px_rgba(16,185,129,0.3)]"
                      >
                        <svg
                          className="w-7 h-7 sm:w-10 sm:h-10 ml-0.5 sm:ml-1"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        <span className="absolute -inset-2 rounded-full border border-emerald-500/30 animate-ping opacity-20"></span>
                      </button>
                      <p className="text-base sm:text-xl font-bold text-slate-200 mb-2">
                        AIエージェントの動きを見る
                      </p>
                      <p className="text-xs sm:text-sm text-slate-500">
                        ボタンを押してデモを開始
                      </p>
                    </div>
                  </div>
                )}

                {/* 実行中オーバーレイ（枠線のみ） */}
                {step !== "idle" && (
                  <div className="absolute inset-0 z-20 pointer-events-none border-4 border-emerald-500/20 rounded-xl animate-pulse"></div>
                )}

                {/* Sidebar */}
                <div className="hidden md:flex w-20 flex-col items-center py-6 border-r border-white/5 bg-slate-900/50 gap-8 backdrop-blur-sm">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-emerald-500/20">
                    A
                  </div>
                  <div className="flex flex-col gap-6 w-full px-4">
                    <div className="aspect-square rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                    <div className="aspect-square rounded-xl hover:bg-white/5 text-slate-500 flex items-center justify-center transition-colors cursor-pointer">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 p-3 sm:p-6 md:p-8 overflow-hidden relative flex flex-col bg-slate-950">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-8 gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`w-2 h-2 rounded-full ${isRunning ? "bg-emerald-500 animate-pulse" : "bg-slate-600"} shadow-[0_0_8px_rgba(16,185,129,0.6)]`}
                        ></span>
                        <span className="text-[10px] sm:text-xs font-bold text-emerald-400 uppercase tracking-wider">
                          {isRunning ? "Active Campaign" : "Ready"}
                        </span>
                      </div>
                      <h2 className="text-sm sm:text-xl md:text-2xl font-bold text-slate-100 truncate">
                        製造業向け_環境ソリューション提案
                      </h2>
                    </div>
                    <div
                      className={`hidden sm:flex gap-3 transition-opacity duration-300 ${step === "idle" || step === "uploading" ? "opacity-50" : "opacity-100"}`}
                    >
                      <div className="h-8 sm:h-10 px-3 sm:px-4 rounded-lg border border-white/10 bg-slate-900 flex items-center text-xs sm:text-sm font-medium text-slate-400 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-slate-600 mr-2"></span>
                        残り 78件 / 100件
                      </div>
                      <div
                        className={`h-8 sm:h-10 px-4 sm:px-6 rounded-lg text-white flex items-center text-xs sm:text-sm font-bold shadow-lg border ${isRunning ? "bg-emerald-600 shadow-emerald-500/20 border-emerald-500/50" : "bg-slate-700 border-slate-600"}`}
                      >
                        {isRunning ? "実行中" : "待機中"}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:gap-6 grid-cols-1 md:grid-cols-12 h-full">
                    {/* Left Panel: Analyzing & Queue - Hidden on mobile, shown as simplified version */}
                    <div className="md:col-span-4 flex flex-col gap-3 sm:gap-4">
                      <div className="rounded-lg sm:rounded-xl border border-white/10 bg-slate-900/50 p-3 sm:p-5 shadow-lg relative overflow-hidden backdrop-blur-sm">
                        {step === "analyzing" && (
                          <div className="absolute inset-0 bg-slate-900/95 z-10 flex flex-col items-center justify-center animate-fade-in text-center p-3 sm:p-4 border border-white/10">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin mb-2 sm:mb-3"></div>
                            <span className="text-xs sm:text-sm font-bold text-slate-200">
                              Webサイト解析中...
                            </span>
                            <span className="text-[10px] sm:text-xs text-slate-500 mt-1">
                              企業理念・最新ニュースを抽出しています
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between mb-2 sm:mb-4">
                          <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase">
                            Target Queue
                          </span>
                        </div>
                        <div className="space-y-2 sm:space-y-3">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className={`group flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg sm:rounded-xl transition-all duration-300 ${i === 1 && step !== "idle" && step !== "uploading" ? "bg-emerald-500/10 border border-emerald-500/30 shadow-sm scale-[1.02]" : "border border-transparent hover:bg-white/5"}`}
                            >
                              <div
                                className={`w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center text-[10px] sm:text-xs font-bold transition-colors duration-300 ${i === 1 && step !== "idle" && step !== "uploading" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-600"}`}
                              >
                                {i === 1 && step !== "idle" ? "Now" : i}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs sm:text-sm font-bold text-slate-300 truncate">
                                  株式会社エコロジー{i > 1 ? i : ""}
                                </div>
                                <div className="text-[10px] sm:text-xs text-slate-600 truncate hidden sm:block">
                                  代表問い合わせフォーム
                                </div>
                              </div>
                              {i === 1 &&
                                step !== "idle" &&
                                step !== "uploading" && (
                                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
                                )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Auto-filling Form Preview */}
                      <div
                        className={`hidden sm:block rounded-lg sm:rounded-xl border border-white/10 bg-slate-900/50 p-3 sm:p-5 shadow-lg transition-all duration-500 backdrop-blur-sm ${step === "filling" || step === "logging" ? "ring-1 ring-emerald-500/50 shadow-emerald-500/10" : ""}`}
                      >
                        <div className="flex items-center justify-between mb-2 sm:mb-3">
                          <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase">
                            Form Auto-Fill
                          </div>
                          {(step === "filling" || step === "logging") && (
                            <span className="text-[8px] sm:text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 sm:px-2 py-0.5 rounded-full animate-fade-in border border-emerald-500/30">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="space-y-2 sm:space-y-4">
                          <div>
                            <div className="h-1.5 sm:h-2 w-10 sm:w-12 bg-slate-800 rounded mb-1 sm:mb-1.5"></div>
                            <div
                              className={`h-7 sm:h-9 w-full rounded-md sm:rounded-lg bg-slate-950 border border-white/10 flex items-center px-2 sm:px-3 text-xs sm:text-sm transition-all duration-300 overflow-hidden whitespace-nowrap text-left ${formValues.company ? "text-slate-200 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]" : "text-transparent"}`}
                            >
                              {formValues.company}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:gap-3">
                            <div>
                              <div className="h-1.5 sm:h-2 w-6 sm:w-8 bg-slate-800 rounded mb-1 sm:mb-1.5"></div>
                              <div
                                className={`h-7 sm:h-9 w-full rounded-md sm:rounded-lg bg-slate-950 border border-white/10 flex items-center px-2 sm:px-3 text-xs sm:text-sm transition-all duration-300 overflow-hidden whitespace-nowrap text-left ${formValues.name ? "text-slate-200 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]" : "text-transparent"}`}
                              >
                                {formValues.name}
                              </div>
                            </div>
                            <div>
                              <div className="h-1.5 sm:h-2 w-6 sm:w-8 bg-slate-800 rounded mb-1 sm:mb-1.5"></div>
                              <div
                                className={`h-7 sm:h-9 w-full rounded-md sm:rounded-lg bg-slate-950 border border-white/10 flex items-center px-2 sm:px-3 text-xs sm:text-sm transition-all duration-300 overflow-hidden whitespace-nowrap text-left ${formValues.email ? "text-slate-200 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]" : "text-transparent"}`}
                              >
                                {formValues.email}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Panel: AI Generation */}
                    <div className="md:col-span-8 flex flex-col h-full pb-2 sm:pb-4">
                      <div className="flex-1 rounded-lg sm:rounded-xl border border-white/10 bg-slate-900/50 p-3 sm:p-6 shadow-lg relative overflow-hidden flex flex-col transition-all duration-500 hover:shadow-xl backdrop-blur-sm">
                        <div className="flex items-center justify-between mb-3 sm:mb-6 border-b border-white/5 pb-2 sm:pb-4">
                          <div className="flex items-center gap-2 sm:gap-4">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-slate-800 to-slate-700 flex items-center justify-center text-slate-400 font-bold text-sm sm:text-lg shadow-inner border border-white/5">
                              E
                            </div>
                            <div>
                              <div className="text-xs sm:text-base font-bold text-slate-200">
                                株式会社エコロジー 御中
                              </div>
                              <div className="text-[10px] sm:text-xs text-slate-500 flex items-center gap-1">
                                <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
                                <span className="truncate max-w-[120px] sm:max-w-none">
                                  https://ecology.co.jp
                                </span>
                              </div>
                            </div>
                          </div>
                          {step !== "idle" &&
                            step !== "uploading" &&
                            step !== "analyzing" && (
                              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20 animate-scale-in shadow-sm">
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2.5}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                                High Match Score
                              </div>
                            )}
                        </div>

                        <div className="flex-1 relative min-h-[120px] sm:min-h-[200px]">
                          <div className="absolute inset-0 font-mono text-xs sm:text-sm leading-relaxed text-slate-400 whitespace-pre-wrap overflow-hidden">
                            {step === "idle" ||
                            step === "uploading" ||
                            step === "analyzing" ? (
                              <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2 sm:gap-4">
                                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                                  <svg
                                    className="w-6 h-6 sm:w-8 sm:h-8"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={1}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                                    />
                                  </svg>
                                </div>
                                <p className="text-xs sm:text-base">
                                  Waiting for company analysis...
                                </p>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1 sm:gap-2 mb-2 sm:mb-4 text-[10px] sm:text-xs font-bold text-slate-500 select-none flex-wrap">
                                  <span className="px-1.5 sm:px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/5">
                                    AI Model v4.0
                                  </span>
                                  <span className="hidden sm:inline">
                                    Generating personalized message...
                                  </span>
                                </div>
                                <span className="text-slate-200 text-xs sm:text-base drop-shadow-sm">
                                  {typedText}
                                </span>
                                {step === "generating" && (
                                  <span className="inline-block w-1.5 sm:w-2 h-4 sm:h-5 bg-emerald-500 ml-1 animate-pulse align-middle shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* AI Floating Badge */}
                        {(step === "generating" ||
                          step === "filling" ||
                          step === "logging") && (
                          <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 flex items-center gap-1.5 sm:gap-2 bg-slate-900/90 pl-1.5 pr-2 sm:pl-2 sm:pr-4 py-1.5 sm:py-2 rounded-full shadow-xl border border-emerald-500/30 ring-1 ring-emerald-500/20 z-20 backdrop-blur-md">
                            <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                              <svg
                                className="w-3 h-3 sm:w-4 sm:h-4 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                              </svg>
                            </div>
                            <div className="hidden sm:flex flex-col">
                              <span className="text-[10px] font-bold text-slate-500 leading-none">
                                POWERED BY
                              </span>
                              <span className="text-xs font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent leading-none mt-0.5">
                                AI Personalization
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Logging Toast (Futuristic Design) */}
          <div
            className={`pointer-events-none absolute z-50 transition-all duration-500 transform 
                            left-2 right-2 bottom-4
                            sm:left-auto sm:right-2 sm:top-64 sm:bottom-auto
                            md:-right-8 md:top-40 
                            lg:-right-12 lg:top-48
                            ${logVisible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-95"}
                        `}
            aria-hidden={!logVisible}
          >
            <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-slate-900/95 p-3 sm:p-5 shadow-2xl backdrop-blur-xl border border-white/10 ring-1 ring-white/20 min-w-0 sm:min-w-[280px] md:min-w-[320px] text-left text-white">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 opacity-80" />
              <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-emerald-500/20 blur-[50px] rounded-full pointer-events-none" />
              <div className="flex items-start gap-3 sm:gap-4 relative z-10">
                <div className="flex h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                  <svg
                    className="w-5 h-5 sm:w-6 sm:h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <p className="text-[10px] sm:text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      Sent Successfully
                    </p>
                    <span className="text-[9px] sm:text-[10px] text-slate-300 font-mono bg-slate-800/50 px-1.5 py-0.5 rounded">
                      {logTime}
                    </span>
                  </div>
                  <p className="text-sm sm:text-base font-bold truncate">
                    {logCompany}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] sm:text-xs text-slate-300">
                    <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-slate-500"></span>
                    <p className="truncate">To: {logContact} 様</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
