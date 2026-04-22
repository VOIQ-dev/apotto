"use client";

import { useEffect, useState } from "react";
import { Modal, Button } from "@mantine/core";

export const WARN_STORAGE_KEYS = {
  generate: "ai-custom:skipGenerateWarning",
  send: "ai-custom:skipSendWarning",
} as const;

export type ActionType = "generate" | "send" | "both";

type Props = {
  opened: boolean;
  actionType: ActionType | null;
  onCancel: () => void;
  onConfirm: () => void;
};

function readSkip(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSkip(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    // noop
  }
}

/** モーダルを表示すべきかを判定（警告が全て非表示ならスキップ可） */
export function shouldShowConfirm(actionType: ActionType): boolean {
  const needGen = actionType === "generate" || actionType === "both";
  const needSend = actionType === "send" || actionType === "both";
  const skipGen = readSkip(WARN_STORAGE_KEYS.generate);
  const skipSend = readSkip(WARN_STORAGE_KEYS.send);
  if (needGen && !skipGen) return true;
  if (needSend && !skipSend) return true;
  return false;
}

export function ActionConfirmModal({
  opened,
  actionType,
  onCancel,
  onConfirm,
}: Props) {
  const [skipGenerate, setSkipGenerate] = useState(false);
  const [skipSend, setSkipSend] = useState(false);

  useEffect(() => {
    if (opened) {
      setSkipGenerate(false);
      setSkipSend(false);
    }
  }, [opened]);

  if (!actionType) return null;

  const showGenerateWarning =
    (actionType === "generate" || actionType === "both") &&
    !readSkip(WARN_STORAGE_KEYS.generate);
  const showSendWarning =
    (actionType === "send" || actionType === "both") &&
    !readSkip(WARN_STORAGE_KEYS.send);

  const title =
    actionType === "generate"
      ? "AI文面生成を開始します"
      : actionType === "send"
        ? "フォーム送信を開始します"
        : "AI生成＆送信を開始します";

  const handleConfirm = () => {
    if (showGenerateWarning && skipGenerate) {
      writeSkip(WARN_STORAGE_KEYS.generate, true);
    }
    if (showSendWarning && skipSend) {
      writeSkip(WARN_STORAGE_KEYS.send, true);
    }
    onConfirm();
  };

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={<span className="font-semibold text-foreground">{title}</span>}
      centered
      size="md"
      closeOnClickOutside={false}
      closeOnEscape
      styles={{
        content: {
          backgroundColor: "var(--card)",
          color: "var(--foreground)",
        },
        header: {
          backgroundColor: "var(--card)",
          borderBottom: "1px solid var(--border)",
          color: "var(--foreground)",
        },
        title: { color: "var(--foreground)" },
        close: {
          color: "var(--foreground)",
          backgroundColor: "transparent",
        },
        body: {
          backgroundColor: "var(--card)",
          color: "var(--foreground)",
        },
      }}
    >
      <div className="space-y-4 text-sm text-foreground">
        {showGenerateWarning && (
          <section className="rounded-lg border border-amber-500/50 dark:border-amber-400/40 bg-amber-50 dark:bg-amber-400/10 p-3">
            <div className="mb-1 font-semibold text-amber-700 dark:text-amber-300">
              ⚠️ AI文面生成中の注意
            </div>
            <div className="text-slate-700 dark:text-slate-300">
              AI文面生成中はアプリ内のページ遷移ができません。
              遷移すると生成が中断されるため、完了までこの画面をお開きください。
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={skipGenerate}
                onChange={(e) => setSkipGenerate(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border"
              />
              <span>次回から表示しない</span>
            </label>
          </section>
        )}

        {showSendWarning && (
          <section className="rounded-lg border border-rose-500/50 dark:border-rose-400/40 bg-rose-50 dark:bg-rose-400/10 p-3">
            <div className="mb-1 font-semibold text-rose-700 dark:text-rose-300">
              ⚠️ フォーム送信中の注意
            </div>
            <div className="text-slate-700 dark:text-slate-300">
              送信中は Chrome 拡張機能が自動でタブを開いてフォーム送信します。
              <br />
              開いたタブを
              <strong className="text-rose-700 dark:text-rose-200">
                手動で閉じたり操作したりしないでください
              </strong>
              。 送信失敗や予期しない動作の原因になります。
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={skipSend}
                onChange={(e) => setSkipSend(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border"
              />
              <span>次回から表示しない</span>
            </label>
          </section>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="default"
            onClick={onCancel}
            className="btn-confirm-cancel"
          >
            キャンセル
          </Button>
          <Button onClick={handleConfirm} className="btn-confirm-primary">
            同意して実行
          </Button>
        </div>
      </div>
    </Modal>
  );
}
