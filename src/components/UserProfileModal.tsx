"use client";

import { useState } from "react";
import { Modal } from "@mantine/core";

type UserProfileData = {
  companyName: string;
  email: string;
  name: string;
};

type UserProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userData: UserProfileData;
  onUpdateEmail: (newEmail: string) => Promise<void>;
  onUpdatePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  onLogout: () => Promise<void>;
};

export function UserProfileModal({
  isOpen,
  onClose,
  userData,
  onUpdateEmail,
  onUpdatePassword,
  onLogout,
}: UserProfileModalProps) {
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newEmail, setNewEmail] = useState(userData.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!isOpen) return null;

  const handleEmailUpdate = async () => {
    if (!newEmail || newEmail === userData.email) {
      setIsEditingEmail(false);
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await onUpdateEmail(newEmail);
      setSuccess("メールアドレスを更新しました");
      setIsEditingEmail(false);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async () => {
    setError("");
    setSuccess("");

    if (!currentPassword || !newPassword) {
      setError("すべての項目を入力してください");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("新しいパスワードが一致しません");
      return;
    }

    if (newPassword.length < 8) {
      setError("パスワードは8文字以上で入力してください");
      return;
    }

    setLoading(true);
    try {
      await onUpdatePassword(currentPassword, newPassword);
      setSuccess("パスワードを更新しました");
      setIsChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setError("");
    try {
      await onLogout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログアウトに失敗しました");
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title="ユーザー情報"
      size="md"
      centered
      overlayProps={{
        opacity: 0.7,
        blur: 8,
      }}
      classNames={{
        content: "bg-white dark:bg-slate-900",
        header:
          "!bg-slate-50 dark:!bg-slate-800 border-b border-slate-200 dark:border-slate-700",
        title: "!text-slate-900 dark:!text-slate-50 !font-bold",
        close:
          "!text-slate-500 hover:!text-slate-900 dark:!text-slate-400 dark:hover:!text-slate-50",
      }}
      styles={{
        body: {
          padding: 0,
        },
        header: {
          backgroundColor: "transparent",
        },
        title: {
          color: "inherit",
        },
      }}
    >
      <div className="px-6 py-6 space-y-6 max-h-[70vh] overflow-y-auto bg-white dark:bg-slate-900">
        {/* Success/Error Messages */}
        {success && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm text-emerald-700 dark:text-emerald-400">
            ✓ {success}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
            ✗ {error}
          </div>
        )}

        {/* Company Name (Read-only) */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
            会社名
          </label>
          <div className="px-4 py-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
            {userData.companyName || "-"}
          </div>
        </div>

        {/* User Name (Read-only) */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
            名前
          </label>
          <div className="px-4 py-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
            {userData.name || "-"}
          </div>
        </div>

        {/* Email (Editable) */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
            メールアドレス
          </label>
          {isEditingEmail ? (
            <div className="space-y-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="new-email@example.com"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleEmailUpdate}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {loading ? "更新中..." : "保存"}
                </button>
                <button
                  onClick={() => {
                    setIsEditingEmail(false);
                    setNewEmail(userData.email);
                  }}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                {userData.email}
              </div>
              <button
                onClick={() => setIsEditingEmail(true)}
                className="px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
              >
                変更
              </button>
            </div>
          )}
        </div>

        {/* Password Change */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
            パスワード
          </label>
          {isChangingPassword ? (
            <div className="space-y-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="現在のパスワード"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="新しいパスワード（8文字以上）"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="新しいパスワード（確認）"
              />
              <div className="flex gap-2">
                <button
                  onClick={handlePasswordUpdate}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {loading ? "更新中..." : "保存"}
                </button>
                <button
                  onClick={() => {
                    setIsChangingPassword(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setError("");
                  }}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsChangingPassword(true)}
              className="w-full px-4 py-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-left font-medium"
            >
              パスワードを変更
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 space-y-3">
        <button
          onClick={handleLogout}
          disabled={loading}
          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {loading ? "ログアウト中..." : "ログアウト"}
        </button>
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-50 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors font-medium"
        >
          閉じる
        </button>
      </div>
    </Modal>
  );
}
