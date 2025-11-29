'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type AnimationStep =
    | 'uploading'   // 1. ファイルドロップ & アップロード
    | 'analyzing'   // 2. 解析中 (プログレスバー)
    | 'generating'  // 3. AI生成 (タイピング)
    | 'filling'     // 4. フォーム自動入力
    | 'logging'     // 5. 送信完了ログ
    | 'complete';   // 6. 完了 & リセット待機

import { Background3D } from '@/components/landing/Background3D';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function Hero() {
    const [step, setStep] = useState<AnimationStep>('uploading');

    // アップロード進捗 (0-100)
    const [uploadProgress, setUploadProgress] = useState(0);

    // 生成テキスト
    const [typedText, setTypedText] = useState('');
    const fullText = '貴社の「持続可能な社会の実現」という理念に深く共感いたしました。特に、最近の環境配慮型素材への転換は素晴らしい取り組みだと感じております。弊社のAIソリューションであれば、その生産効率をさらに...';

    // フォーム入力値
    const [formValues, setFormValues] = useState({ name: '', company: '', email: '' });

    // ログ表示用
    const [logEntry, setLogEntry] = useState<{ company: string; contact: string; time: string } | null>(null);

    const logVisible = Boolean(logEntry) && (step === 'logging' || step === 'complete');
    const logCompany = logEntry?.company ?? '株式会社エコロジー';
    const logContact = logEntry?.contact ?? '環境 太郎';
    const logTime = logEntry?.time ?? '09:42';

    // アニメーションループ制御
    useEffect(() => {
        let cancelled = false;

        const runSequence = async (): Promise<void> => {
            // 1. Upload Phase
            if (cancelled) return;
            setStep('uploading');
            setUploadProgress(0);
            setTypedText('');
            setFormValues({ name: '', company: '', email: '' });
            setLogEntry(null);

            // Simulate file drop & upload
            for (let i = 0; i <= 100; i += 4) {
                if (cancelled) return;
                setUploadProgress(i);
                await sleep(20);
            }
            await sleep(300);

            // 2. Analyzing Phase
            if (cancelled) return;
            setStep('analyzing');
            await sleep(1200);

            // 3. Generating Phase
            if (cancelled) return;
            setStep('generating');
            for (let i = 0; i < fullText.length; i++) {
                if (cancelled) return;
                setTypedText(prev => prev + fullText.charAt(i));
                await sleep(20); // Slightly faster typing
            }
            await sleep(600);

            // 4. Filling Phase
            if (cancelled) return;
            setStep('filling');
            const targetValues = {
                company: '株式会社エコロジー',
                name: '環境 太郎',
                email: 'kankyo@ecology.co.jp'
            };

            // Sequential filling with visual emphasis
            if (cancelled) return;
            setFormValues(prev => ({ ...prev, company: targetValues.company }));
            await sleep(200);
            if (cancelled) return;
            setFormValues(prev => ({ ...prev, name: targetValues.name }));
            await sleep(200);
            if (cancelled) return;
            setFormValues(prev => ({ ...prev, email: targetValues.email }));
            await sleep(600);

            // 5. Logging Phase
            if (cancelled) return;
            setStep('logging');
            setLogEntry({
                company: targetValues.company,
                contact: targetValues.name,
                time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
            });
            await sleep(1800);

            // 6. Complete & Loop
            if (cancelled) return;
            setStep('complete');
            await sleep(1500);

            // Restart
            if (!cancelled) {
                void runSequence();
            }
        };

        void runSequence();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <section className="relative overflow-hidden pt-32 pb-20 md:pt-48 md:pb-32">
            <Background3D />

            <div className="mx-auto max-w-7xl px-6 text-center relative z-10">

                {/* ロゴを文言の右上に配置 */}
                <div className="relative inline-block">
                    <img
                        src="/apotto/apotto_logo.png"
                        alt="Apotto Logo"
                        className="absolute -top-8 -right-32 h-40 w-80 hidden sm:block"
                    />
                    <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl animate-fade-in-up delay-100">
                        <span className="block text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700">
                            1社1社に、
                        </span>
                        <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500 drop-shadow-[0_0_30px_rgba(52,211,153,0.3)]">
                            心を込めたアプローチを。
                        </span>
                    </h1>
                </div>

                <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600 animate-fade-in-up delay-200">
                    企業情報をAIが分析し、<span className="text-slate-900 font-semibold">完全にパーソナライズされた文面</span>を自動生成。<br className="hidden sm:inline" />
                    フォーム投稿まで自動化し、質の高いリード獲得を実現します。
                </p>

                <div className="mt-10 flex items-center justify-center gap-x-6 animate-fade-in-up delay-300">
                    <Link
                        href="/login"
                        className="rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:bg-emerald-500 hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] hover:scale-105 transition-all duration-300"
                    >
                        無料で試してみる
                    </Link>
                    <a href="#features" className="text-sm font-semibold leading-6 text-slate-700 flex items-center gap-1 hover:text-emerald-600 transition-colors">
                        機能詳細 <span aria-hidden="true">→</span>
                    </a>
                </div>

                {/* Hero Image / Dashboard Preview */}
                <div className="mt-20 relative animate-fade-in-up delay-400 perspective-1000">
                    <div className="relative mx-auto max-w-5xl rounded-2xl border border-white/10 bg-slate-900/40 p-2 backdrop-blur-xl shadow-2xl shadow-emerald-500/10 ring-1 ring-white/5 transform rotate-x-2 transition-transform duration-500 hover:rotate-x-0">
                        <div className="rounded-xl border border-white/10 bg-slate-950/80 overflow-hidden flex flex-col h-full min-h-[550px]">
                            {/* Window Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-900/50">
                                <div className="flex gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                                    <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                                    <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                                </div>
                                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1/3 h-6 rounded-md bg-white/5 text-[10px] flex items-center justify-center text-slate-400 font-mono border border-white/5">
                                    apotto.ai/campaigns/new
                                </div>
                                <div className="w-16"></div>
                            </div>

                            {/* App UI Mockup */}
                            <div className="flex flex-1 bg-slate-950 overflow-hidden relative">

                                {/* Overlay for File Drop Animation */}
                                {step === 'uploading' && (
                                    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/60 backdrop-blur-[4px] animate-fade-in">
                                        <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-slate-900 shadow-2xl border-2 border-dashed border-emerald-500/30 min-w-[320px] animate-bounce-subtle ring-1 ring-white/10">
                                            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                                                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                            </div>
                                            <p className="text-xl font-bold text-slate-200 mb-2">企業リストを解析中</p>
                                            <p className="text-sm text-slate-500 mb-6">target_companies.csv</p>
                                            <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500 transition-all duration-100 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: `${uploadProgress}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Sidebar */}
                                <div className="hidden md:flex w-20 flex-col items-center py-6 border-r border-white/5 bg-slate-900/50 gap-8 backdrop-blur-sm">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-emerald-500/20">A</div>
                                    <div className="flex flex-col gap-6 w-full px-4">
                                        <div className="aspect-square rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                                        <div className="aspect-square rounded-xl hover:bg-white/5 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></div>
                                        <div className="aspect-square rounded-xl hover:bg-white/5 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg></div>
                                    </div>
                                </div>

                                {/* Main Content */}
                                <div className="flex-1 p-8 overflow-hidden relative flex flex-col bg-slate-950">
                                    <div className="flex items-center justify-between mb-8">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
                                                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Active Campaign</span>
                                            </div>
                                            <h2 className="text-2xl font-bold text-slate-100">製造業向け_環境ソリューション提案</h2>
                                        </div>
                                        <div className={`flex gap-3 transition-opacity duration-300 ${step === 'uploading' ? 'opacity-50' : 'opacity-100'}`}>
                                            <div className="h-10 px-4 rounded-lg border border-white/10 bg-slate-900 flex items-center text-sm font-medium text-slate-400 shadow-sm">
                                                <span className="w-2 h-2 rounded-full bg-slate-600 mr-2"></span>
                                                残り 78件 / 100件
                                            </div>
                                            <div className="h-10 px-6 rounded-lg bg-emerald-600 text-white flex items-center text-sm font-bold shadow-lg shadow-emerald-500/20 border border-emerald-500/50">
                                                実行中
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid gap-6 md:grid-cols-12 h-full">
                                        {/* Left Panel: Analyzing & Queue */}
                                        <div className="md:col-span-4 flex flex-col gap-4">
                                            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5 shadow-lg relative overflow-hidden backdrop-blur-sm">
                                                {step === 'analyzing' && (
                                                    <div className="absolute inset-0 bg-slate-900/95 z-10 flex flex-col items-center justify-center animate-fade-in text-center p-4 border border-white/10">
                                                        <div className="w-10 h-10 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin mb-3"></div>
                                                        <span className="text-sm font-bold text-slate-200">Webサイト解析中...</span>
                                                        <span className="text-xs text-slate-500 mt-1">企業理念・最新ニュースを抽出しています</span>
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between mb-4">
                                                    <span className="text-xs font-bold text-slate-500 uppercase">Target Queue</span>
                                                </div>
                                                <div className="space-y-3">
                                                    {[1, 2, 3].map((i) => (
                                                        <div key={i} className={`group flex items-center gap-3 p-3 rounded-xl transition-all duration-300 ${i === 1 && step !== 'uploading' ? 'bg-emerald-500/10 border border-emerald-500/30 shadow-sm scale-[1.02]' : 'border border-transparent hover:bg-white/5'}`}>
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors duration-300 ${i === 1 && step !== 'uploading' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
                                                                {i === 1 ? 'Now' : i}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-sm font-bold text-slate-300 truncate">株式会社エコロジー{i > 1 ? i : ''}</div>
                                                                <div className="text-xs text-slate-600 truncate">代表問い合わせフォーム</div>
                                                            </div>
                                                            {i === 1 && step !== 'uploading' && (
                                                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Auto-filling Form Preview */}
                                            <div className={`rounded-xl border border-white/10 bg-slate-900/50 p-5 shadow-lg transition-all duration-500 backdrop-blur-sm ${step === 'filling' || step === 'complete' ? 'ring-1 ring-emerald-500/50 shadow-emerald-500/10' : ''}`}>
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="text-xs font-bold text-slate-500 uppercase">Form Auto-Fill</div>
                                                    {(step === 'filling' || step === 'complete') && (
                                                        <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full animate-fade-in border border-emerald-500/30">Active</span>
                                                    )}
                                                </div>
                                                <div className="space-y-4">
                                                    <div>
                                                        <div className="h-2 w-12 bg-slate-800 rounded mb-1.5"></div>
                                                        <div className={`h-9 w-full rounded-lg bg-slate-950 border border-white/10 flex items-center px-3 text-sm transition-all duration-300 overflow-hidden whitespace-nowrap text-left ${formValues.company ? 'text-slate-200 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'text-transparent'}`}>
                                                            {formValues.company}
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <div className="h-2 w-8 bg-slate-800 rounded mb-1.5"></div>
                                                            <div className={`h-9 w-full rounded-lg bg-slate-950 border border-white/10 flex items-center px-3 text-sm transition-all duration-300 overflow-hidden whitespace-nowrap text-left ${formValues.name ? 'text-slate-200 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'text-transparent'}`}>
                                                                {formValues.name}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="h-2 w-8 bg-slate-800 rounded mb-1.5"></div>
                                                            <div className={`h-9 w-full rounded-lg bg-slate-950 border border-white/10 flex items-center px-3 text-sm transition-all duration-300 overflow-hidden whitespace-nowrap text-left ${formValues.email ? 'text-slate-200 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'text-transparent'}`}>
                                                                {formValues.email}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Panel: AI Generation */}
                                        <div className="md:col-span-8 flex flex-col h-full pb-4">
                                            <div className="flex-1 rounded-xl border border-white/10 bg-slate-900/50 p-6 shadow-lg relative overflow-hidden flex flex-col transition-all duration-500 hover:shadow-xl backdrop-blur-sm">
                                                <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-800 to-slate-700 flex items-center justify-center text-slate-400 font-bold text-lg shadow-inner border border-white/5">E</div>
                                                        <div>
                                                            <div className="text-base font-bold text-slate-200">株式会社エコロジー 御中</div>
                                                            <div className="text-xs text-slate-500 flex items-center gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
                                                                https://ecology.co.jp
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {step !== 'uploading' && step !== 'analyzing' && (
                                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20 animate-scale-in shadow-sm">
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                            High Match Score
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex-1 relative">
                                                    <div className="absolute inset-0 font-mono text-sm leading-relaxed text-slate-400 whitespace-pre-wrap overflow-hidden">
                                                        {(step === 'uploading' || step === 'analyzing') ? (
                                                            <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
                                                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                                                                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                                                </div>
                                                                <p>Waiting for company analysis...</p>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="flex items-center gap-2 mb-4 text-xs font-bold text-slate-500 select-none">
                                                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/5">AI Model v4.0</span>
                                                                    <span>Generating personalized message...</span>
                                                                </div>
                                                                <span className="text-slate-200 text-base drop-shadow-sm">{typedText}</span>
                                                                {step === 'generating' && <span className="inline-block w-2 h-5 bg-emerald-500 ml-1 animate-pulse align-middle shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* AI Floating Badge */}
                                                {(step === 'generating' || step === 'filling' || step === 'complete') && (
                                                    <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-slate-900/90 pl-2 pr-4 py-2 rounded-full shadow-xl border border-emerald-500/30 ring-1 ring-emerald-500/20 animate-bounce-subtle z-20 backdrop-blur-md">
                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-bold text-slate-500 leading-none">POWERED BY</span>
                                                            <span className="text-xs font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent leading-none mt-0.5">AI Personalization</span>
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
                        className={`pointer-events-none absolute right-2 top-2 sm:-top-6 sm:-right-6 lg:-top-10 lg:-right-10 z-40 transition-all duration-500 transform ${
                            logVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'
                        }`}
                        aria-hidden={!logVisible}
                    >
                        <div className="relative overflow-hidden rounded-2xl bg-slate-900/95 p-5 shadow-2xl backdrop-blur-xl border border-white/10 ring-1 ring-white/20 min-w-[280px] sm:min-w-[320px] text-left text-white">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 opacity-80" />
                            <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-emerald-500/20 blur-[50px] rounded-full pointer-events-none" />
                            <div className="flex items-start gap-4 relative z-10">
                                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Sent Successfully</p>
                                        <span className="text-[10px] text-slate-300 font-mono bg-slate-800/50 px-1.5 py-0.5 rounded">{logTime}</span>
                                    </div>
                                    <p className="text-base font-bold truncate">{logCompany}</p>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-300">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
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
