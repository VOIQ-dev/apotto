'use client';

import { useState } from 'react';

type ContactFormData = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  content: string;
};

const INITIAL_DATA: ContactFormData = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  content: '',
};

export function ContactForm() {
  const [formData, setFormData] = useState<ContactFormData>(INITIAL_DATA);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    try {
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
      setFormData(INITIAL_DATA);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '予期せぬエラーが発生しました');
    }
  };

  if (status === 'success') {
    return (
      <section id="contact" className="py-24 bg-slate-50">
        <div className="mx-auto max-w-xl px-6 text-center">
           <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-6">
             <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
               <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
             </svg>
           </div>
           <h2 className="text-2xl font-bold text-slate-900">お問い合わせありがとうございます</h2>
           <p className="mt-4 text-slate-600">
             内容を確認の上、担当者よりご連絡させていただきます。<br/>
             今しばらくお待ちください。
           </p>
           <button 
             onClick={() => setStatus('idle')}
             className="mt-8 text-sm font-medium text-primary hover:text-primary/80 underline"
           >
             フォームに戻る
           </button>
        </div>
      </section>
    );
  }

  return (
    <section id="contact" className="py-24 bg-slate-50 relative overflow-hidden">
      {/* Decor */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent"></div>
      <div className="absolute -left-40 top-20 w-80 h-80 bg-blue-100 rounded-full blur-3xl opacity-30 pointer-events-none"></div>
      <div className="absolute -right-40 bottom-20 w-80 h-80 bg-indigo-100 rounded-full blur-3xl opacity-30 pointer-events-none"></div>

      <div className="mx-auto max-w-xl px-6 relative z-10">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">お問い合わせ</h2>
          <p className="mt-4 text-muted-foreground">
            導入のご相談、デモのご依頼など、お気軽にお問い合わせください。<br/>
            通常1営業日以内にご返信いたします。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-slate-700 mb-1">会社名 <span className="text-rose-500">*</span></label>
              <input
                type="text"
                id="companyName"
                name="companyName"
                required
                value={formData.companyName}
                onChange={handleChange}
                className="input-clean"
                placeholder="株式会社サンプル"
              />
            </div>
            
            <div>
              <label htmlFor="contactName" className="block text-sm font-medium text-slate-700 mb-1">担当者名 <span className="text-rose-500">*</span></label>
              <input
                type="text"
                id="contactName"
                name="contactName"
                required
                value={formData.contactName}
                onChange={handleChange}
                className="input-clean"
                placeholder="山田 太郎"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">メールアドレス <span className="text-rose-500">*</span></label>
              <input
                type="email"
                id="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="input-clean"
                placeholder="taro.yamada@example.com"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">電話番号</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="input-clean"
                placeholder="03-1234-5678"
              />
            </div>

            <div>
              <label htmlFor="content" className="block text-sm font-medium text-slate-700 mb-1">お問い合わせ内容</label>
              <textarea
                id="content"
                name="content"
                rows={4}
                value={formData.content}
                onChange={handleChange}
                className="input-clean resize-y"
                placeholder="デモを希望します。導入費用について知りたいです。"
              />
            </div>
          </div>

          {status === 'error' && (
            <div className="p-3 rounded-lg bg-rose-50 text-rose-600 text-sm">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full btn-primary py-3 text-base shadow-lg shadow-primary/20"
          >
            {status === 'submitting' ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                送信中...
              </span>
            ) : (
              '送信する'
            )}
          </button>
          
          <p className="text-center text-xs text-slate-500 mt-4">
             お客様の個人情報は、お問い合わせ対応のためにのみ利用します。<br/>
             <a href="#" className="underline hover:text-slate-700">プライバシーポリシー</a>をご確認ください。
          </p>
        </form>
      </div>
    </section>
  );
}

