'use client';

import { useState } from 'react';

type TabType = 'download' | 'demo';

type DownloadFormData = {
  lastName: string;
  firstName: string;
  companyName: string;
  department: string;
  position: string;
  email: string;
  phone: string;
  howDidYouHear: string;
  howDidYouHearOther: string;
};

type DemoFormData = {
  lastName: string;
  firstName: string;
  companyName: string;
  department: string;
  position: string;
  email: string;
  phone: string;
  employeeCount: string;
  serviceUrl: string;
  averageOrderValue: string;
  howDidYouHear: string;
  howDidYouHearOther: string;
  expectedStartDate: string;
  content: string;
};

const INITIAL_DOWNLOAD_DATA: DownloadFormData = {
  lastName: '',
  firstName: '',
  companyName: '',
  department: '',
  position: '',
  email: '',
  phone: '',
  howDidYouHear: '',
  howDidYouHearOther: '',
};

const INITIAL_DEMO_DATA: DemoFormData = {
  lastName: '',
  firstName: '',
  companyName: '',
  department: '',
  position: '',
  email: '',
  phone: '',
  employeeCount: '',
  serviceUrl: '',
  averageOrderValue: '',
  howDidYouHear: '',
  howDidYouHearOther: '',
  expectedStartDate: '',
  content: '',
};

const HOW_DID_YOU_HEAR_OPTIONS = [
  '選択してください',
  'Google検索',
  'SNS（Twitter/X、Facebook等）',
  '知人・同僚の紹介',
  'ニュース記事・メディア',
  '展示会・セミナー',
  '広告',
  'その他',
];

const EMPLOYEE_COUNT_OPTIONS = [
  '選択してください',
  '50名以下',
  '51〜100名',
  '101〜500名',
  '501〜1000名',
  '1001〜5000名',
  '5001名〜',
];

const AVERAGE_ORDER_VALUE_OPTIONS = [
  '選択してください',
  '30万円以下',
  '31万円〜50万円',
  '51万円〜100万円',
  '101〜300万円',
  '301〜500万円',
  '501〜1000万円',
  '1000万円以上',
];

const EXPECTED_START_DATE_OPTIONS = [
  '選択してください',
  '1ヶ月以内',
  '3ヶ月以内',
  '6ヶ月以内',
  '1年以内',
  '未定・情報収集中',
];

export function ContactForm() {
  const [activeTab, setActiveTab] = useState<TabType>('download');
  const [downloadData, setDownloadData] = useState<DownloadFormData>(INITIAL_DOWNLOAD_DATA);
  const [demoData, setDemoData] = useState<DemoFormData>(INITIAL_DEMO_DATA);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleDownloadChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setDownloadData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDemoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setDemoData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    try {
      const formData = activeTab === 'download' 
        ? { ...downloadData, formType: 'download' }
        : { ...demoData, formType: 'demo' };

      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || '送信に失敗しました');
      }

      setStatus('success');
      setDownloadData(INITIAL_DOWNLOAD_DATA);
      setDemoData(INITIAL_DEMO_DATA);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '予期せぬエラーが発生しました');
    }
  };

  const inputClass = 'w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all';
  const selectClass = 'w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all appearance-none cursor-pointer';
  const labelClass = 'block text-sm font-medium text-slate-700 mb-2';


  return (
    <section id="contact" className="py-24 bg-gradient-to-b from-white to-emerald-50/30 relative overflow-hidden">
      {/* 背景デコレーション */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-100 rounded-full blur-3xl opacity-30 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-100 rounded-full blur-3xl opacity-30 translate-y-1/2 -translate-x-1/2" />
      </div>

      <div className="mx-auto max-w-3xl px-6 relative z-10">
        {/* ヘッダー */}
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 text-emerald-600 text-sm font-semibold tracking-wide uppercase mb-4 bg-emerald-50 px-4 py-1.5 rounded-full">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Contact
          </span>
          <h2 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
            Apotto – 商談が「勝手に入る」<br className="sm:hidden" />営業AIエージェント
          </h2>
          <p className="mt-6 text-slate-700 text-sm leading-relaxed max-w-2xl mx-auto">
            セールスのプロによるオンボーディングと運用サポートつきで、<br />
            <span className="font-semibold">導入直後から効果が出る環境</span>をご提供します。
          </p>
        </div>

        {/* タブナビゲーション */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-emerald-50 rounded-xl p-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('download')}
              className={`px-6 py-3 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'download'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-emerald-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                資料ダウンロード
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('demo')}
              className={`px-6 py-3 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'demo'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-emerald-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                無料デモ申し込み
              </span>
            </button>
          </div>
        </div>

        {/* フォーム */}
        <div className="bg-white rounded-2xl shadow-xl shadow-emerald-100/50 border border-emerald-100 p-8 lg:p-10">
          {activeTab === 'download' ? (
            <form onSubmit={handleSubmit}>
              <div className="grid gap-5">
                {/* 姓・名 */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="lastName" className={labelClass}>
                      姓 <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="lastName"
                      name="lastName"
                      required
                      value={downloadData.lastName}
                      onChange={handleDownloadChange}
                      className={inputClass}
                      placeholder="山田"
                    />
                  </div>
                  <div>
                    <label htmlFor="firstName" className={labelClass}>
                      名 <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      name="firstName"
                      required
                      value={downloadData.firstName}
                      onChange={handleDownloadChange}
                      className={inputClass}
                      placeholder="太郎"
                    />
                  </div>
                </div>

                {/* 会社名 */}
                <div>
                  <label htmlFor="companyName" className={labelClass}>
                    会社名 <span className="text-emerald-600">*</span>
                  </label>
                  <input
                    type="text"
                    id="companyName"
                    name="companyName"
                    required
                    value={downloadData.companyName}
                    onChange={handleDownloadChange}
                    className={inputClass}
                    placeholder="株式会社サンプル"
                  />
                </div>

                {/* 部署名・役職名 */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="department" className={labelClass}>
                      部署名 <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="department"
                      name="department"
                      required
                      value={downloadData.department}
                      onChange={handleDownloadChange}
                      className={inputClass}
                      placeholder="営業部"
                    />
                  </div>
                  <div>
                    <label htmlFor="position" className={labelClass}>
                      役職名 <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="position"
                      name="position"
                      required
                      value={downloadData.position}
                      onChange={handleDownloadChange}
                      className={inputClass}
                      placeholder="部長"
                    />
                  </div>
                </div>

                {/* メール・電話 */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="email" className={labelClass}>
                      メールアドレス <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      value={downloadData.email}
                      onChange={handleDownloadChange}
                      className={inputClass}
                      placeholder="taro.yamada@example.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className={labelClass}>
                      電話番号 <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      required
                      value={downloadData.phone}
                      onChange={handleDownloadChange}
                      className={inputClass}
                      placeholder="03-1234-5678"
                    />
                  </div>
                </div>

                {/* どこでお知りになりましたか */}
                <div>
                  <label htmlFor="howDidYouHear" className={labelClass}>
                    どこでお知りになりましたか？ <span className="text-emerald-600">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="howDidYouHear"
                      name="howDidYouHear"
                      required
                      value={downloadData.howDidYouHear}
                      onChange={handleDownloadChange}
                      className={selectClass}
                    >
                      {HOW_DID_YOU_HEAR_OPTIONS.map((option, i) => (
                        <option key={i} value={i === 0 ? '' : option} disabled={i === 0}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  {/* その他を選択した場合の入力フィールド */}
                  {downloadData.howDidYouHear === 'その他' && (
                    <div className="mt-3">
                      <input
                        type="text"
                        id="howDidYouHearOther"
                        name="howDidYouHearOther"
                        required
                        value={downloadData.howDidYouHearOther || ''}
                        onChange={handleDownloadChange}
                        className={inputClass}
                        placeholder="具体的にご記入ください"
                      />
                    </div>
                  )}
                </div>

                {status === 'error' && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === 'submitting' || status === 'success'}
                  className={`w-full rounded-xl px-6 py-4 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 transition-all disabled:cursor-not-allowed shadow-lg shadow-emerald-200 ${
                    status === 'success' 
                      ? 'bg-emerald-600' 
                      : 'bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50'
                  }`}
                >
                  {status === 'submitting' ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      送信中...
                    </span>
                  ) : status === 'success' ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      送信完了
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      資料をダウンロード
                    </span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="grid gap-5">
                {/* 姓・名 */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="demo-lastName" className={labelClass}>
                      姓 <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="demo-lastName"
                      name="lastName"
                      required
                      value={demoData.lastName}
                      onChange={handleDemoChange}
                      className={inputClass}
                      placeholder="山田"
                    />
                  </div>
                  <div>
                    <label htmlFor="demo-firstName" className={labelClass}>
                      名 <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="demo-firstName"
                      name="firstName"
                      required
                      value={demoData.firstName}
                      onChange={handleDemoChange}
                      className={inputClass}
                      placeholder="太郎"
                    />
                  </div>
                </div>

                {/* 会社名 */}
                <div>
                  <label htmlFor="demo-companyName" className={labelClass}>
                    会社名 <span className="text-emerald-600">*</span>
                  </label>
                  <input
                    type="text"
                    id="demo-companyName"
                    name="companyName"
                    required
                    value={demoData.companyName}
                    onChange={handleDemoChange}
                    className={inputClass}
                    placeholder="株式会社サンプル"
                  />
                </div>

                {/* 部署名・役職名 */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="demo-department" className={labelClass}>
                      部署名 <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="demo-department"
                      name="department"
                      required
                      value={demoData.department}
                      onChange={handleDemoChange}
                      className={inputClass}
                      placeholder="営業部"
                    />
                  </div>
                  <div>
                    <label htmlFor="demo-position" className={labelClass}>
                      役職名 <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="demo-position"
                      name="position"
                      required
                      value={demoData.position}
                      onChange={handleDemoChange}
                      className={inputClass}
                      placeholder="部長"
                    />
                  </div>
                </div>

                {/* メール・電話 */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="demo-email" className={labelClass}>
                      メールアドレス <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="email"
                      id="demo-email"
                      name="email"
                      required
                      value={demoData.email}
                      onChange={handleDemoChange}
                      className={inputClass}
                      placeholder="taro.yamada@example.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="demo-phone" className={labelClass}>
                      電話番号 <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="tel"
                      id="demo-phone"
                      name="phone"
                      required
                      value={demoData.phone}
                      onChange={handleDemoChange}
                      className={inputClass}
                      placeholder="03-1234-5678"
                    />
                  </div>
                </div>

                {/* 従業員規模(単体) */}
                <div>
                  <label htmlFor="demo-employeeCount" className={labelClass}>
                    従業員規模(単体) <span className="text-emerald-600">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="demo-employeeCount"
                      name="employeeCount"
                      required
                      value={demoData.employeeCount}
                      onChange={handleDemoChange}
                      className={selectClass}
                    >
                      {EMPLOYEE_COUNT_OPTIONS.map((option, i) => (
                        <option key={i} value={i === 0 ? '' : option} disabled={i === 0}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* 対象サービスのURL */}
                <div>
                  <label htmlFor="demo-serviceUrl" className={labelClass}>
                    対象サービスのURL <span className="text-emerald-600">*</span>
                  </label>
                  <input
                    type="url"
                    id="demo-serviceUrl"
                    name="serviceUrl"
                    required
                    value={demoData.serviceUrl || ''}
                    onChange={handleDemoChange}
                    className={inputClass}
                    placeholder="https://example.com"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">apottoを利用される対象サービス(貴社商材)のURLをご入力ください。</p>
                </div>

                {/* 上記サービスの受注平均単価 */}
                <div>
                  <label htmlFor="demo-averageOrderValue" className={labelClass}>
                    上記サービスの受注平均単価（1受注あたりの売上） <span className="text-emerald-600">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="demo-averageOrderValue"
                      name="averageOrderValue"
                      required
                      value={demoData.averageOrderValue || ''}
                      onChange={handleDemoChange}
                      className={selectClass}
                    >
                      {AVERAGE_ORDER_VALUE_OPTIONS.map((option, i) => (
                        <option key={i} value={i === 0 ? '' : option} disabled={i === 0}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* どこでお知りになりましたか */}
                <div>
                  <label htmlFor="demo-howDidYouHear" className={labelClass}>
                    どこでお知りになりましたか？ <span className="text-emerald-600">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="demo-howDidYouHear"
                      name="howDidYouHear"
                      required
                      value={demoData.howDidYouHear}
                      onChange={handleDemoChange}
                      className={selectClass}
                    >
                      {HOW_DID_YOU_HEAR_OPTIONS.map((option, i) => (
                        <option key={i} value={i === 0 ? '' : option} disabled={i === 0}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  {/* その他を選択した場合の入力フィールド */}
                  {demoData.howDidYouHear === 'その他' && (
                    <div className="mt-3">
                      <input
                        type="text"
                        id="demo-howDidYouHearOther"
                        name="howDidYouHearOther"
                        required
                        value={demoData.howDidYouHearOther || ''}
                        onChange={handleDemoChange}
                        className={inputClass}
                        placeholder="具体的にご記入ください"
                      />
                    </div>
                  )}
                </div>

                {/* 利用開始想定時期 */}
                <div>
                  <label htmlFor="demo-expectedStartDate" className={labelClass}>
                    利用開始想定時期 <span className="text-emerald-600">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="demo-expectedStartDate"
                      name="expectedStartDate"
                      required
                      value={demoData.expectedStartDate}
                      onChange={handleDemoChange}
                      className={selectClass}
                    >
                      {EXPECTED_START_DATE_OPTIONS.map((option, i) => (
                        <option key={i} value={i === 0 ? '' : option} disabled={i === 0}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* お問い合わせ背景(詳細) */}
                <div>
                  <label htmlFor="demo-content" className={labelClass}>
                    お問い合わせ背景(詳細) <span className="text-emerald-600">*</span>
                  </label>
                  <textarea
                    id="demo-content"
                    name="content"
                    rows={4}
                    required
                    value={demoData.content}
                    onChange={handleDemoChange}
                    className={`${inputClass} resize-none`}
                    placeholder="apottoにご興味をお持ちになった背景や貴社の課題感をご記載ください"
                  />
                </div>

                {status === 'error' && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === 'submitting'}
                  className="w-full rounded-xl bg-emerald-500 px-6 py-4 text-sm font-semibold text-white hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200"
                >
                  {status === 'submitting' ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      送信中...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      無料デモを申し込む
                    </span>
                  )}
                </button>
              </div>
            </form>
          )}

          <p className="text-center text-xs text-slate-500 mt-6">
            お客様の個人情報は、お問い合わせ対応のためにのみ利用します。
            <a href="https://voiq.jp/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700 transition-colors ml-1">
              プライバシーポリシー
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
