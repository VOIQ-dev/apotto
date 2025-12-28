'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Account = {
  id: string;
  company_id: string;
  email: string;
  name: string | null;
  role: string;
  status: 'invited' | 'active' | 'inactive' | string;
  invited_at: string | null;
  activated_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type Company = {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  accounts: Account[];
  accountCount: number;
};

type CompaniesResponse = {
  companies?: Company[];
  error?: string;
};

function formatDateJP(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ja-JP');
}

function formatDateTimeJP(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function roleLabel(role: string): string {
  return role === 'admin' ? '管理者' : 'メンバー';
}

function loginStateLabel(account: Account): string {
  return account.last_login_at ? 'ログイン済' : '未ログイン';
}

function loginStateClass(account: Account): string {
  return account.last_login_at
    ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/20'
    : 'bg-slate-500/15 text-slate-200 border-slate-500/20';
}

export default function BackofficeCompaniesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Company modal
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [companyModalMode, setCompanyModalMode] = useState<'create' | 'edit'>('create');
  const [companyModalTarget, setCompanyModalTarget] = useState<Company | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');
  const [companySubmitting, setCompanySubmitting] = useState(false);

  // Account modal
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountModalMode, setAccountModalMode] = useState<'create' | 'edit'>('create');
  const [accountModalCompany, setAccountModalCompany] = useState<Company | null>(null);
  const [accountModalTarget, setAccountModalTarget] = useState<Account | null>(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountDisplayName, setAccountDisplayName] = useState('');
  const [accountRole, setAccountRole] = useState<'admin' | 'member'>('member');
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [revealResetPassword, setRevealResetPassword] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

  // Delete account confirm modal
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<{
    companyName: string;
    account: Account;
  } | null>(null);
  const [deleteAccountSubmitting, setDeleteAccountSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, query]);

  async function fetchCompanies() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/backoffice/companies');
      if (res.status === 401) {
        router.replace('/backoffice/login');
        return;
      }
      const data = (await res.json().catch(() => ({}))) as CompaniesResponse;
      if (!res.ok) throw new Error(data.error || '取得に失敗しました');
      setCompanies(Array.isArray(data.companies) ? data.companies : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await fetch('/api/backoffice/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/backoffice/login');
  };

  const openCreateCompany = () => {
    setCompanyModalMode('create');
    setCompanyModalTarget(null);
    setCompanyName('');
    setCompanyDomain('');
    setCompanyModalOpen(true);
  };

  const openEditCompany = (company: Company) => {
    setCompanyModalMode('edit');
    setCompanyModalTarget(company);
    setCompanyName(company.name);
    setCompanyDomain(company.domain ?? '');
    setCompanyModalOpen(true);
  };

  const submitCompany = async (event: FormEvent) => {
    event.preventDefault();
    setCompanySubmitting(true);
    setError(null);
    try {
      const name = companyName.trim();
      const domain = companyDomain.trim();
      if (!name) throw new Error('会社名は必須です');

      const isEdit = companyModalMode === 'edit' && companyModalTarget;
      const url = isEdit
        ? `/api/backoffice/companies/${companyModalTarget.id}`
        : '/api/backoffice/companies';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, domain: domain || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');

      setCompanyModalOpen(false);
      await fetchCompanies();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setCompanySubmitting(false);
    }
  };

  const deleteCompany = async (company: Company) => {
    const ok = window.confirm(`「${company.name}」を削除しますか？（配下のアカウントも削除されます）`);
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/backoffice/companies/${company.id}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      await fetchCompanies();
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    }
  };

  const openCreateAccount = (company: Company) => {
    setIssuedPassword(null);
    setNewPassword('');
    setAccountModalMode('create');
    setAccountModalCompany(company);
    setAccountModalTarget(null);
    setAccountEmail('');
    setAccountDisplayName('');
    setAccountRole('member');
    setAccountModalOpen(true);
  };

  const openEditAccount = (company: Company, account: Account) => {
    setIssuedPassword(null);
    setNewPassword('');
    setAccountModalMode('edit');
    setAccountModalCompany(company);
    setAccountModalTarget(account);
    setAccountEmail(account.email);
    setAccountDisplayName(account.name ?? '');
    setAccountRole((account.role === 'admin' ? 'admin' : 'member') as 'admin' | 'member');
    setAccountModalOpen(true);
  };

  const submitAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!accountModalCompany) return;

    setAccountSubmitting(true);
    setError(null);

    try {
      const email = accountEmail.trim();
      if (!email) throw new Error('メールアドレスは必須です');

      if (accountModalMode === 'create') {
        const res = await fetch(
          `/api/backoffice/companies/${accountModalCompany.id}/accounts`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              name: accountDisplayName.trim() || undefined,
              role: accountRole,
            }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          initialPassword?: string;
        };
        if (!res.ok) throw new Error(data.error || '作成に失敗しました');
        setIssuedPassword(String(data.initialPassword ?? ''));
        await fetchCompanies();
        return;
      }

      if (!accountModalTarget) return;
      const res = await fetch(`/api/backoffice/accounts/${accountModalTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: accountDisplayName.trim() || null,
          role: accountRole,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || '更新に失敗しました');
      setAccountModalOpen(false);
      await fetchCompanies();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setAccountSubmitting(false);
    }
  };

  const resetPassword = async () => {
    if (!accountModalTarget) return;
    setAccountSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/backoffice/accounts/${accountModalTarget.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        initialPassword?: string;
      };
      if (!res.ok) throw new Error(data.error || '再発行に失敗しました');
      setIssuedPassword(String(data.initialPassword ?? ''));
      setNewPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '再発行に失敗しました');
    } finally {
      setAccountSubmitting(false);
    }
  };

  const revealResetPasswordFor = () => {
    setRevealResetPassword(true);
    window.setTimeout(() => setRevealResetPassword(false), 1500);
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      throw new Error('clipboard api unavailable');
    } catch {
      // fallback
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-1000px';
        textarea.style.left = '-1000px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        // ignore
      }
    }
  };

  const deleteAccount = async (account: Account) => {
    setError(null);
    try {
      const res = await fetch(`/api/backoffice/accounts/${account.id}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      await fetchCompanies();
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    }
  };

  const openDeleteAccountModal = (company: Company, account: Account) => {
    setDeleteAccountTarget({ companyName: company.name, account });
  };

  const confirmDeleteAccount = async () => {
    if (!deleteAccountTarget) return;
    setDeleteAccountSubmitting(true);
    setError(null);
    try {
      await deleteAccount(deleteAccountTarget.account);
      setDeleteAccountTarget(null);
    } catch {
      // errors are surfaced via setError in deleteAccount
    } finally {
      setDeleteAccountSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-sm font-semibold">Backoffice</div>
              <div className="text-xs text-slate-400">企業・アカウント管理</div>
            </div>
          </div>

          <button onClick={() => void handleLogout()} className="btn-secondary">
            ログアウト
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <input
              className="input-clean w-full bg-slate-900/60"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="企業名で検索..."
            />
          </div>
          <button onClick={openCreateCompany} className="btn-primary">
            ＋ 企業を追加
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4">
          {loading ? (
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6 text-sm text-slate-400">
              読み込み中...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6 text-sm text-slate-400">
              企業がありません
            </div>
          ) : (
            filtered.map((company) => {
              const isOpen = Boolean(expanded[company.id]);
              return (
                <div key={company.id} className="rounded-2xl border border-white/10 bg-slate-900/40">
                  <div className="flex items-center justify-between gap-3 p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 text-sm font-bold">
                        {company.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="text-base font-semibold">{company.name}</div>
                        <div className="text-xs text-slate-400">
                          {company.accountCount}ユーザー・{formatDateJP(company.created_at)}登録
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditCompany(company)}
                        className="text-xs text-slate-300 hover:text-white"
                        title="編集"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => void deleteCompany(company)}
                        className="text-slate-400 hover:text-rose-300"
                        title="削除"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3m-4 0h14"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() =>
                          setExpanded((prev) => ({ ...prev, [company.id]: !isOpen }))
                        }
                        className="text-slate-300 hover:text-white"
                        title={isOpen ? '閉じる' : '開く'}
                      >
                        {isOpen ? '▴' : '▾'}
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-white/10 p-5">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-200">ユーザー一覧</div>
                        <button
                          className="text-sm text-amber-300 hover:text-amber-200"
                          onClick={() => openCreateAccount(company)}
                        >
                          ＋ ユーザー追加
                        </button>
                      </div>

                      <div className="mt-3 grid gap-2">
                        {company.accounts.length === 0 ? (
                          <div className="rounded-lg border border-white/10 bg-slate-950/20 p-4 text-sm text-slate-400">
                            ユーザーがいません
                          </div>
                        ) : (
                          company.accounts.map((account) => (
                            <div
                              key={account.id}
                              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/20 px-4 py-3"
                            >
                              <button
                                className="flex flex-1 items-start gap-3 text-left"
                                onClick={() => openEditAccount(company, account)}
                              >
                                <div
                                  className={`mt-1 h-2.5 w-2.5 rounded-full ${
                                    account.last_login_at ? 'bg-emerald-400' : 'bg-amber-400'
                                  }`}
                                />
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">{account.email}</div>
                                  {account.name && (
                                    <div className="truncate text-xs text-slate-300">
                                      {account.name}
                                    </div>
                                  )}
                                  <div className="text-xs text-slate-400">
                                    {roleLabel(account.role)}・登録 {formatDateJP(account.created_at)}
                                    {account.last_login_at
                                      ? `・最終ログイン ${formatDateTimeJP(account.last_login_at)}`
                                      : '・未ログイン'}
                                  </div>
                                </div>
                              </button>

                              <div className="flex items-center gap-2">
                                <div
                                  className={`rounded-full border px-3 py-1 text-xs ${loginStateClass(
                                    account
                                  )}`}
                                  title={
                                    account.last_login_at
                                      ? `最終ログイン: ${formatDateTimeJP(account.last_login_at)}`
                                      : '未ログイン'
                                  }
                                >
                                  {loginStateLabel(account)}
                                </div>
                                <button
                                  className="rounded-lg p-2 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                                  onClick={() => openDeleteAccountModal(company, account)}
                                  title="ユーザーを削除"
                                >
                                  <svg
                                    className="h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3m-4 0h14"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Company modal */}
      {companyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950 p-6">
            <div className="mb-4">
              <div className="text-lg font-bold">
                {companyModalMode === 'create' ? '企業を追加' : '企業を編集'}
              </div>
              <div className="text-xs text-slate-400">
                会社名とドメイン（任意）を設定します。
              </div>
            </div>
            <form onSubmit={submitCompany} className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-semibold text-slate-300">会社名</label>
                <input
                  className="input-clean bg-slate-900/60"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold text-slate-300">ドメイン（任意）</label>
                <input
                  className="input-clean bg-slate-900/60"
                  value={companyDomain}
                  onChange={(e) => setCompanyDomain(e.target.value)}
                  placeholder="example.com"
                />
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCompanyModalOpen(false)}
                >
                  キャンセル
                </button>
                <button type="submit" className="btn-primary" disabled={companySubmitting}>
                  {companySubmitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account modal */}
      {accountModalOpen && accountModalCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950 p-6">
            <div className="mb-4">
              <div className="text-lg font-bold">
                {accountModalMode === 'create' ? 'ユーザーを追加' : 'ユーザーを編集'}
              </div>
              <div className="text-xs text-slate-400">
                会社: <span className="font-semibold text-slate-200">{accountModalCompany.name}</span>
              </div>
            </div>

            {issuedPassword ? (
              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                <div className="text-sm font-semibold">初期ログイン情報</div>
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-1">
                    <div className="text-[11px] text-slate-400">メール</div>
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/30 px-3 py-2">
                      <div className="min-w-0 truncate font-mono text-sm text-slate-200">
                        {accountEmail.trim()}
                      </div>
                      <button
                        type="button"
                        className="btn-secondary py-1 px-2 text-xs"
                        onClick={async () => {
                          await copyToClipboard(accountEmail.trim());
                          setCopiedMessage('メールをコピーしました');
                          setTimeout(() => setCopiedMessage(null), 1200);
                        }}
                      >
                        コピー
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-1">
                    <div className="text-[11px] text-slate-400">初期パスワード</div>
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/30 px-3 py-2">
                      <div className="min-w-0 truncate font-mono text-sm text-slate-200">
                        {issuedPassword}
                      </div>
                      <button
                        type="button"
                        className="btn-secondary py-1 px-2 text-xs"
                        onClick={async () => {
                          await copyToClipboard(issuedPassword);
                          setCopiedMessage('パスワードをコピーしました');
                          setTimeout(() => setCopiedMessage(null), 1200);
                        }}
                      >
                        コピー
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-2 text-xs text-slate-400">
                  初回ログインでパスワード変更画面へ誘導されます。
                </div>
                {copiedMessage && (
                  <div className="mt-3 text-xs text-emerald-300">{copiedMessage}</div>
                )}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button className="btn-primary" onClick={() => setAccountModalOpen(false)}>
                    閉じる
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitAccount} className="grid gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-semibold text-slate-300">メールアドレス</label>
                  <input
                    className="input-clean bg-slate-900/60"
                    value={accountEmail}
                    onChange={(e) => setAccountEmail(e.target.value)}
                    type="email"
                    required
                    disabled={accountModalMode === 'edit'}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-semibold text-slate-300">表示名（任意）</label>
                  <input
                    className="input-clean bg-slate-900/60"
                    value={accountDisplayName}
                    onChange={(e) => setAccountDisplayName(e.target.value)}
                    placeholder="山田 太郎"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold text-slate-300">権限</label>
                    <select
                      className="input-clean bg-slate-900/60"
                      value={accountRole}
                      onChange={(e) => setAccountRole(e.target.value as 'admin' | 'member')}
                    >
                      <option value="admin">admin（管理者）</option>
                      <option value="member">member（一般）</option>
                    </select>
                  </div>
                </div>

                {accountModalMode === 'edit' && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4">
                    <div className="text-sm font-semibold">パスワード再発行</div>
                    <div className="mt-1 text-xs text-slate-400">
                      現在のパスワードは取得できません。再発行（または指定）してログイン用の初期パスワードを表示します。
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                      <div className="relative">
                        <input
                          className="input-clean bg-slate-900/60 pr-12"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="空なら自動生成（8文字以上で指定も可）"
                          autoComplete="new-password"
                          type={revealResetPassword ? 'text' : 'password'}
                        />
                        <button
                          type="button"
                          onClick={revealResetPasswordFor}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-300 hover:text-white"
                          aria-label="パスワードを表示"
                          title="1.5秒だけ表示"
                        >
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void resetPassword()}
                        disabled={accountSubmitting}
                      >
                        再発行
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setAccountModalOpen(false)}
                  >
                    キャンセル
                  </button>
                  <button type="submit" className="btn-primary" disabled={accountSubmitting}>
                    {accountSubmitting ? '保存中...' : '保存'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Delete account confirm modal */}
      {deleteAccountTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950 p-6">
            <div className="mb-4">
              <div className="text-lg font-bold">ユーザーを削除</div>
              <div className="text-xs text-slate-400">
                削除対象を確認して「削除する」を押してください。
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4 text-sm">
              <div className="text-xs text-slate-400">会社</div>
              <div className="font-semibold text-slate-200">
                {deleteAccountTarget.companyName}
              </div>
              <div className="mt-3 text-xs text-slate-400">アカウント</div>
              <div className="font-mono text-slate-200 break-all">
                {deleteAccountTarget.account.email}
              </div>
              {deleteAccountTarget.account.name && (
                <div className="mt-1 text-xs text-slate-300">
                  表示名: {deleteAccountTarget.account.name}
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteAccountTarget(null)}
                disabled={deleteAccountSubmitting}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="btn-secondary border-rose-500/30 text-rose-200 hover:border-rose-500/50"
                onClick={() => void confirmDeleteAccount()}
                disabled={deleteAccountSubmitting}
              >
                {deleteAccountSubmitting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}





