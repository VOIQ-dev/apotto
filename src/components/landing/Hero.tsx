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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function Hero() {
  const [step, setStep] = useState<AnimationStep>('uploading');
  
  // アップロード進捗 (0-100)
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // 生成テキスト
  const [typedText, setTypedText] = useState('');
  const fullText = '御社のDX推進事例を拝見し、特に〇〇の取り組みに感銘を受けました。弊社のAIツールであれば...';
  
  // フォーム入力値
  const [formValues, setFormValues] = useState({ name: '', company: '', email: '' });

  // ログ表示用
  const [logEntry, setLogEntry] = useState<{ company: string; contact: string; time: string } | null>(null);

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
      for (let i = 0; i <= 100; i += 5) {
        if (cancelled) return;
        setUploadProgress(i);
        await sleep(20);
      }
      await sleep(500);

      // 2. Analyzing Phase
      if (cancelled) return;
      setStep('analyzing');
      await sleep(1500);

      // 3. Generating Phase
      if (cancelled) return;
      setStep('generating');
      for (let i = 0; i < fullText.length; i++) {
        if (cancelled) return;
        setTypedText(prev => prev + fullText.charAt(i));
        await sleep(30);
      }
      await sleep(500);

      // 4. Filling Phase
      if (cancelled) return;
      setStep('filling');
      const targetValues = { 
        company: '株式会社サンプル1', 
        name: '佐藤 健太', 
        email: 'sato@sample.co.jp' 
      };
      
      // Sequential filling
      if (cancelled) return;
      setFormValues(prev => ({ ...prev, company: targetValues.company }));
      await sleep(300);
      if (cancelled) return;
      setFormValues(prev => ({ ...prev, name: targetValues.name }));
      await sleep(300);
      if (cancelled) return;
      setFormValues(prev => ({ ...prev, email: targetValues.email }));
      await sleep(800);

      // 5. Logging Phase
      if (cancelled) return;
      setStep('logging');
      setLogEntry({
        company: targetValues.company,
        contact: targetValues.name,
        time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      });
      await sleep(1500);

      // 6. Complete & Loop
      if (cancelled) return;
      setStep('complete');
      await sleep(2000);
      
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
      {/* Background Elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/10 blur-[100px] rounded-full opacity-50 animate-pulse-glow" />
        <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-blue-400/10 blur-[120px] rounded-full opacity-30" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
      </div>

      <div className="mx-auto max-w-7xl px-6 text-center">
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary backdrop-blur-sm animate-fade-in-up">
          <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
          新時代のAI営業アシスタント
        </div>
        
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl animate-fade-in-up delay-100">
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-foreground to-foreground/70">
            アポ獲得を、
          </span>
          <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-600">
            もっとスマートに。
          </span>
        </h1>
        
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground animate-fade-in-up delay-200">
          相手企業に合わせた文面をAIが自動生成し、最適なタイミングでアプローチ。<br className="hidden sm:inline" />
          開封率・クリック率を可視化し、データドリブンな営業活動を実現します。
        </p>
        
        <div className="mt-10 flex items-center justify-center gap-x-6 animate-fade-in-up delay-300">
          <Link
            href="/login"
            className="rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-all active:scale-95"
          >
            無料で始める
          </Link>
          <a href="#features" className="text-sm font-semibold leading-6 text-foreground flex items-center gap-1 hover:text-primary transition-colors">
            機能を見る <span aria-hidden="true">→</span>
          </a>
        </div>

        {/* Hero Image / Dashboard Preview */}
        <div className="mt-20 relative animate-fade-in-up delay-400 perspective-1000">
          <div className="relative mx-auto max-w-5xl rounded-2xl border border-border/50 bg-white/50 p-2 backdrop-blur-sm shadow-2xl shadow-primary/10 ring-1 ring-slate-900/5 transform rotate-x-2 transition-transform duration-500 hover:rotate-x-0">
            <div className="rounded-xl border border-border bg-white overflow-hidden flex flex-col h-full min-h-[500px]">
              {/* Window Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-slate-50/50">
                 <div className="flex gap-1.5">
                   <div className="w-3 h-3 rounded-full bg-red-400/80"></div>
                   <div className="w-3 h-3 rounded-full bg-amber-400/80"></div>
                   <div className="w-3 h-3 rounded-full bg-emerald-400/80"></div>
                 </div>
                 <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1/3 h-6 rounded-md bg-slate-200/50 text-[10px] flex items-center justify-center text-slate-400 font-mono">
                    apotto.ai/dashboard
                 </div>
                 <div className="w-16"></div>
              </div>

              {/* App UI Mockup */}
              <div className="flex flex-1 bg-slate-50 overflow-hidden relative">
                 
                 {/* Overlay for File Drop Animation */}
                 {step === 'uploading' && (
                   <div className="absolute left-4 top-4 z-30 pointer-events-none animate-fade-in">
                      <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-white shadow-2xl border-2 border-dashed border-primary/50 min-w-[240px] animate-bounce-subtle">
                         <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                         </div>
                         <p className="text-lg font-bold text-slate-800">リストをアップロード中...</p>
                         <div className="w-48 h-2 bg-slate-100 rounded-full mt-4 overflow-hidden">
                            <div className="h-full bg-primary transition-all duration-100" style={{ width: `${uploadProgress}%` }}></div>
                         </div>
                      </div>
                   </div>
                 )}

                 {/* Sidebar */}
                 <div className="hidden md:flex w-16 flex-col items-center py-6 border-r border-border bg-white gap-6">
                    <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-sm">A</div>
                    <div className="flex flex-col gap-4">
                       <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg></div>
                       <div className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></div>
                    </div>
                 </div>

                 {/* Main Content */}
                 <div className="flex-1 p-6 overflow-hidden relative flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                       <div>
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Custom</div>
                          <h2 className="text-xl font-bold text-slate-900">AIカスタム文面生成</h2>
                       </div>
                       <div className={`flex gap-3 transition-opacity duration-300 ${step === 'uploading' ? 'opacity-50' : 'opacity-100'}`}>
                          <div className="h-9 px-4 rounded-lg border border-slate-200 bg-white flex items-center text-sm font-medium text-slate-600">
                             {step === 'uploading' ? 'アップロード中...' : 'company_list.xlsx'}
                          </div>
                          <div className="h-9 px-4 rounded-lg bg-primary text-white flex items-center text-sm font-medium shadow-sm shadow-primary/20">生成開始</div>
                       </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-12 h-full">
                       {/* Left Panel: Analyzing & Queue */}
                       <div className="md:col-span-5 flex flex-col gap-4">
                          <div className="rounded-xl border border-border bg-white p-4 shadow-sm relative overflow-hidden">
                             {step === 'analyzing' && (
                                <div className="absolute inset-0 bg-white/90 z-10 flex flex-col items-center justify-center animate-fade-in">
                                   <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2"></div>
                                   <span className="text-xs font-bold text-primary">AI解析中...</span>
                                </div>
                             )}
                             
                             <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-500">QUEUE</span>
                                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">Processing</span>
                             </div>
                             <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                   <div key={i} className={`flex items-center gap-3 p-2 rounded-lg transition-colors duration-300 ${i === 1 && step !== 'uploading' ? 'bg-primary/5 border border-primary/20' : 'border border-transparent'}`}>
                                      <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${i === 1 && step !== 'uploading' ? 'bg-primary animate-pulse' : 'bg-slate-300'}`}></div>
                                      <div className="flex-1 min-w-0">
                                         <div className="text-sm font-medium text-slate-900 truncate">株式会社サンプル{i}</div>
                                         <div className="text-xs text-slate-500 truncate">営業部 / {i === 1 ? '佐藤' : '田中'} 様</div>
                                      </div>
                                   </div>
                                ))}
                             </div>
                          </div>
                          
                          {/* Auto-filling Form Preview */}
                          <div className={`rounded-xl border border-border bg-white p-4 shadow-sm transition-all duration-500 ${step === 'filling' || step === 'complete' ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
                             <div className="text-xs font-bold text-slate-400 uppercase mb-3">Auto-Fill Preview</div>
                             <div className="space-y-3">
                                <div>
                                   <label className="text-[10px] text-slate-500 font-medium">会社名</label>
                                   <div className={`h-8 w-full rounded bg-slate-50 border border-slate-200 flex items-center px-2 text-xs transition-all duration-300 ${formValues.company ? 'text-slate-900 bg-white border-primary/50' : 'text-transparent'}`}>
                                      {formValues.company}
                                   </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                   <div>
                                      <label className="text-[10px] text-slate-500 font-medium">担当者</label>
                                      <div className={`h-8 w-full rounded bg-slate-50 border border-slate-200 flex items-center px-2 text-xs transition-all duration-300 ${formValues.name ? 'text-slate-900 bg-white border-primary/50' : 'text-transparent'}`}>
                                         {formValues.name}
                                      </div>
                                   </div>
                                   <div>
                                      <label className="text-[10px] text-slate-500 font-medium">Email</label>
                                      <div className={`h-8 w-full rounded bg-slate-50 border border-slate-200 flex items-center px-2 text-xs transition-all duration-300 ${formValues.email ? 'text-slate-900 bg-white border-primary/50' : 'text-transparent'}`}>
                                         {formValues.email}
                                      </div>
                                   </div>
                                </div>
                             </div>
                          </div>
                       </div>

                       {/* Right Panel: AI Generation */}
                       <div className="md:col-span-7 flex flex-col h-full pb-4">
                          <div className="flex-1 rounded-xl border border-border bg-white p-6 shadow-sm relative overflow-hidden flex flex-col">
                             <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4">
                                <div className="flex items-center gap-3">
                                   <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">S</div>
                                   <div>
                                      <div className="text-sm font-bold text-slate-900">株式会社サンプル1 御中</div>
                                      <div className="text-xs text-slate-500">https://sample.co.jp</div>
                                   </div>
                                </div>
                                {step !== 'uploading' && step !== 'analyzing' && (
                                   <div className="px-2 py-1 rounded bg-green-50 text-green-600 text-xs font-medium border border-green-100 animate-scale-in">High Match</div>
                                )}
                             </div>
                             
                             <div className="flex-1 font-mono text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
                                {(step === 'uploading' || step === 'analyzing') ? (
                                   <div className="h-full flex items-center justify-center text-slate-300">
                                      Waiting for analysis...
                                   </div>
                                ) : (
                                   <>
                                      <span className="text-slate-400 select-none">Generating response...</span>
                                      <br /><br />
                                      <span className="text-slate-800">{typedText}</span>
                                      {step === 'generating' && <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse align-middle"></span>}
                                   </>
                                )}
                             </div>

                             {/* AI Floating Badge */}
                             {(step === 'generating' || step === 'filling' || step === 'complete') && (
                                <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-white pl-2 pr-4 py-1.5 rounded-full shadow-lg border border-border ring-1 ring-black/5 animate-bounce-subtle">
                                   <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                   </div>
                                   <span className="text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">AI Optimized</span>
                                </div>
                             )}
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
            </div>
            
            {/* Logging Toast (Futuristic Design) */}
            {logEntry && (
               <div className={`absolute -top-8 -right-8 z-40 transition-all duration-500 transform ${
                   step === 'logging' || step === 'complete' 
                     ? 'opacity-100 translate-y-0 translate-x-0' 
                     : 'opacity-0 translate-y-4 -translate-x-4'
                 }`}>
                 <div className="relative overflow-hidden rounded-xl bg-slate-900/90 p-4 shadow-2xl backdrop-blur-md border border-white/10 ring-1 ring-white/20 min-w-[280px]">
                   {/* Decor glow */}
                   <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50"></div>
                   
                   <div className="flex items-start gap-4">
                     <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                       <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                         <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                       </svg>
                     </div>
                     <div className="flex-1 min-w-0">
                       <div className="flex items-center justify-between">
                         <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Transmission Complete</p>
                         <span className="text-[10px] text-slate-500 font-mono">{logEntry.time}</span>
                       </div>
                       <p className="mt-1 text-sm font-medium text-white truncate">{logEntry.company}</p>
                       <p className="text-xs text-slate-400 truncate">To: {logEntry.contact}</p>
                     </div>
                   </div>
                 </div>
               </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
