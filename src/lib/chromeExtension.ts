/**
 * Chrome拡張機能との通信ヘルパー
 */

// Chrome API型定義（windowオブジェクト拡張）
declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (
          extensionId: string,
          message: unknown,
          responseCallback?: (response: unknown) => void,
        ) => void;
        lastError?: { message: string };
      };
    };
  }
}

// Chrome拡張機能のID（本番環境で設定）
const EXTENSION_ID = process.env.NEXT_PUBLIC_CHROME_EXTENSION_ID;

export interface ExtensionQueueItem {
  url: string;
  company: string;
  leadId: string;
  formData: {
    name: string;
    email: string;
    phone?: string;
    company: string;
    message: string;
    lastName?: string;
    firstName?: string;
    lastNameKana?: string;
    firstNameKana?: string;
    postalCode?: string;
    prefecture?: string;
    address?: string;
    department?: string;
    title?: string;
  };
}

export interface ExtensionStatus {
  processing: number;
  pending: number;
  completed: number;
  failed: number;
  items: Array<{
    id: string;
    url: string;
    company: string;
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  }>;
}

/**
 * Chrome拡張機能が利用可能かチェック
 */
export function isExtensionAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.chrome?.runtime?.sendMessage) return false;
  if (!EXTENSION_ID) return false;
  return true;
}

/**
 * Chrome拡張機能にPingを送信して接続確認
 */
export async function pingExtension(): Promise<boolean> {
  if (!isExtensionAvailable()) return false;

  try {
    const response = await sendToExtension({ type: "PING" });
    return response?.success === true;
  } catch {
    return false;
  }
}

/**
 * Chrome拡張機能にバッチアイテムを追加
 */
export async function addBatchToExtension(
  items: ExtensionQueueItem[],
): Promise<{ success: boolean; count?: number; error?: string }> {
  if (!isExtensionAvailable()) {
    return { success: false, error: "Chrome拡張機能が利用できません" };
  }

  try {
    const response = await sendToExtension({
      type: "ADD_BATCH",
      items,
    });

    if (response?.success) {
      return { success: true, count: response.count as number | undefined };
    }

    return {
      success: false,
      error: (response?.error as string | undefined) || "Unknown error",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Chrome拡張機能のキューステータスを取得
 */
export async function getExtensionStatus(): Promise<ExtensionStatus | null> {
  if (!isExtensionAvailable()) return null;

  try {
    const response = await sendToExtension({ type: "GET_STATUS" });
    if (response?.success) {
      return response.data as ExtensionStatus;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Chrome拡張機能にメッセージを送信
 */
export function sendToExtension(
  message: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve, reject) => {
    if (!EXTENSION_ID) {
      reject(new Error("Extension ID not configured"));
      return;
    }

    try {
      if (!window.chrome?.runtime?.sendMessage) {
        reject(new Error("Chrome runtime API not available"));
        return;
      }

      window.chrome.runtime.sendMessage(
        EXTENSION_ID,
        message,
        (response: unknown) => {
          if (window.chrome?.runtime?.lastError) {
            reject(new Error(window.chrome.runtime.lastError.message));
            return;
          }
          resolve(response as Record<string, unknown> | undefined);
        },
      );
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 並行タブ数を取得
 */
export async function getMaxConcurrent(): Promise<number> {
  if (!isExtensionAvailable()) return 3;
  try {
    const response = await sendToExtension({ type: "GET_MAX_CONCURRENT" });
    return (response?.maxConcurrent as number) || 3;
  } catch {
    return 3;
  }
}

/**
 * 並行タブ数を設定
 */
export async function setMaxConcurrent(value: number): Promise<boolean> {
  if (!isExtensionAvailable()) return false;
  try {
    const response = await sendToExtension({
      type: "SET_MAX_CONCURRENT",
      maxConcurrent: value,
    });
    return response?.success === true;
  } catch {
    return false;
  }
}
