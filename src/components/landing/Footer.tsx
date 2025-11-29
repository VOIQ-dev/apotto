'use client';

export function Footer() {
  return (
    <footer className="bg-white text-slate-600 border-t border-slate-100">
      {/* CTA Section */}
      <div className="border-b border-slate-100 bg-gradient-to-b from-white to-emerald-50">
        <div className="mx-auto max-w-7xl px-6 py-24 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            営業の未来を、<br />
            今すぐ体験しましょう。
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-slate-600">
            初期費用0円、クレジットカード登録不要でデモをお試しいただけます。
            あなたの営業プロセスがどれだけ効率化されるか、実感してください。
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <a
              href="#contact"
              className="rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            >
              お問い合わせ
            </a>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* 会社情報 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900">会社情報</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href="https://voiq.jp/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                >
                  運営会社
                </a>
              </li>
            </ul>
          </div>

          {/* サービス */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900">サービス</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a href="#features" className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
                  機能紹介
                </a>
              </li>
              <li>
                <a href="#steps" className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
                  ご利用の流れ
                </a>
              </li>
            </ul>
          </div>

          {/* サポート */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900">サポート</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a href="#contact" className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
                  お問い合わせ
                </a>
              </li>
            </ul>
          </div>

          {/* 法的情報 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900">法的情報</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href="https://voiq.jp/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                >
                  プライバシーポリシー
                </a>
              </li>
              <li>
                <a
                  href="https://voiq.jp/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                >
                  利用規約
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 border-t border-slate-100 pt-8 flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-emerald-600">Apotto</span>
            <span className="text-xs text-slate-400">by</span>
            <a
              href="https://voiq.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              VOIQ Inc.
            </a>
          </div>
          <p className="mt-4 md:mt-0 text-xs text-slate-500">
            &copy; 2025 VOIQ Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

