/// <reference types="chrome" />

import { QueueManager } from "../lib/queue";

const queueManager = new QueueManager();

// デバッグログ収集
const contentLogs: { timestamp: string; message: string; tabId?: number }[] =
  [];
const MAX_LOGS = 200;

function addContentLog(message: string, tabId?: number) {
  const timestamp = new Date().toISOString();
  contentLogs.push({ timestamp, message, tabId });
  if (contentLogs.length > MAX_LOGS) {
    contentLogs.shift();
  }
  console.log(`[Content→BG] ${message}`);
}

// Service Workerの初期化
console.log(
  "[Background] Service Worker initialized (enhanced version with logging)",
);

// アラームを使ってService Workerを定期的に起動（Manifest V3対策）
chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
chrome.alarms.create("processQueue", { periodInMinutes: 0.1 }); // 6秒ごとにキューをチェック

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "keepAlive") {
    console.log("[Background] Keep alive ping");
  }
  if (alarm.name === "processQueue") {
    // 並行数の上限まで処理を開始
    await startNextProcesses();
  }
});

// 内部メッセージリスナー（Content Scriptからの通信）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Message received:", message.type);

  (async () => {
    try {
      switch (message.type) {
        case "ADD_TO_QUEUE":
          await queueManager.addItem(message.payload);
          sendResponse({ success: true });
          break;

        case "GET_QUEUE_STATUS":
          const items = await queueManager.getAllItems();
          sendResponse({ success: true, data: items });
          break;

        case "CLEAR_QUEUE":
          await queueManager.clearAll();
          sendResponse({ success: true });
          break;

        case "CLEAR_COMPLETED_AND_FAILED":
          // 完了と失敗のアイテムを削除
          const allItems = await queueManager.getAllItems();
          for (const item of allItems) {
            if (item.status === "completed" || item.status === "failed") {
              await queueManager.deleteItem(item.id);
            }
          }
          sendResponse({ success: true });
          break;

        case "START_PROCESSING":
          // 並行数の上限まで処理を開始
          await startNextProcesses();
          sendResponse({ success: true });
          break;

        case "DEBUG_LOG":
          // Content Scriptからのデバッグログを収集
          addContentLog(message.message, sender.tab?.id);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: "Unknown message type" });
      }
    } catch (error) {
      console.error("[Background] Error:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })();

  return true; // 非同期レスポンスを有効化
});

// APIベースURLを保存するキー
const API_BASE_URL_KEY = "apiBaseUrl";

// 並行タブ数を取得（デフォルト3）
async function getMaxConcurrent(): Promise<number> {
  const result = await chrome.storage.local.get("maxConcurrent");
  const value = Number(result.maxConcurrent);
  if (Number.isFinite(value) && value >= 1 && value <= 10) {
    return value;
  }
  return 3;
}

// APIベースURLを取得
async function getApiBaseUrl(): Promise<string | null> {
  const result = await chrome.storage.local.get(API_BASE_URL_KEY);
  return result[API_BASE_URL_KEY] || null;
}

// APIベースURLを保存
async function setApiBaseUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [API_BASE_URL_KEY]: url });
}

// ===== 成功URLパターン =====
const SUCCESS_URL_PATTERNS = [
  "thanks",
  "thank-you",
  "thankyou",
  "thank_you",
  "complete",
  "success",
  "sent",
  "done",
  "finish",
  "finished",
  "完了",
  "kanryo",
  "hozon",
  "toroku",
  "kakunin",
  "uketsuke",
  "arigatou",
];

// ===== 失敗カテゴリ分類 =====
type FailureCategory =
  | "FORM_NOT_FOUND"
  | "BUTTON_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CAPTCHA_BLOCKED"
  | "CAPTCHA_SPAM"
  | "ALERT_BLOCKED"
  | "DISABLED_BUTTON"
  | "SUCCESS_UNCONFIRMED"
  | "TIMEOUT"
  | "CONTENT_SCRIPT_ERROR"
  | "UNKNOWN";

function classifyFailure(error: string): FailureCategory {
  const e = error.toLowerCase();
  if (e.includes("フォームが見つかりません") || e.includes("form not found"))
    return "FORM_NOT_FOUND";
  if (e.includes("送信ボタン") && e.includes("見つかりません"))
    return "BUTTON_NOT_FOUND";
  if (e.includes("確認ボタン") && e.includes("見つかりません"))
    return "BUTTON_NOT_FOUND";
  if (e.includes("バリデーション") || e.includes("validation"))
    return "VALIDATION_ERROR";
  if (
    e.includes("captcha") ||
    e.includes("recaptcha") ||
    e.includes("hcaptcha") ||
    e.includes("turnstile")
  ) {
    if (e.includes("スパム") || e.includes("spam")) return "CAPTCHA_SPAM";
    return "CAPTCHA_BLOCKED";
  }
  if (e.includes("ページスクリプトにより") || e.includes("alert"))
    return "ALERT_BLOCKED";
  if (e.includes("disabled")) return "DISABLED_BUTTON";
  if (
    e.includes("成功している可能性") ||
    e.includes("最終送信ボタンが見つかりません") ||
    e.includes("success not confirmed")
  )
    return "SUCCESS_UNCONFIRMED";
  if (e.includes("タイムアウト") || e.includes("timeout")) return "TIMEOUT";
  if (e.includes("content script") || e.includes("応答しません"))
    return "CONTENT_SCRIPT_ERROR";
  return "UNKNOWN";
}

// ===== 詳細ログ送信 =====
interface BatchStats {
  total: number;
  success: number;
  failed: number;
  categories: Record<string, number>;
}

const currentBatchStats: BatchStats = {
  total: 0,
  success: 0,
  failed: 0,
  categories: {},
};

async function sendSubmissionLog(data: {
  status: "success" | "failed";
  company: string;
  targetUrl: string;
  formUrl?: string;
  finalUrl?: string;
  error?: string;
  debugLogs?: string[];
  debugInfo?: Record<string, unknown>;
  validationInfo?: {
    phase: string;
    errors: { field: string; message: string }[];
  }[];
}): Promise<void> {
  const apiBaseUrl = await getApiBaseUrl();
  if (!apiBaseUrl) return;

  const failureCategory =
    data.status === "failed" && data.error
      ? classifyFailure(data.error)
      : undefined;

  // バッチ統計を更新
  currentBatchStats.total++;
  if (data.status === "success") {
    currentBatchStats.success++;
  } else {
    currentBatchStats.failed++;
    if (failureCategory) {
      currentBatchStats.categories[failureCategory] =
        (currentBatchStats.categories[failureCategory] || 0) + 1;
    }
  }

  try {
    await fetch(`${apiBaseUrl}/api/auto-submit/submission-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        type: "entry",
        data: {
          timestamp: new Date().toISOString(),
          status: data.status,
          company: data.company,
          targetUrl: data.targetUrl,
          formUrl: data.formUrl,
          finalUrl: data.finalUrl,
          failureCategory,
          errorDetail: data.error,
          formScore: data.debugInfo?.bestScore,
          formReasons: data.debugInfo?.bestReasons,
          buttonTexts: data.debugInfo?.buttonTexts,
          captchaInfo: data.debugInfo?.hasCaptcha
            ? `${data.debugInfo.captchaType}${data.debugInfo.captchaIsBlocker ? " (blocker)" : " (non-blocker)"}`
            : "なし",
          validationInfo: data.validationInfo,
          debugLogs: data.debugLogs?.slice(-20),
        },
      }),
    });
  } catch (err) {
    console.error("[Background] Failed to send submission log:", err);
  }
}

async function sendBatchSummary(): Promise<void> {
  if (currentBatchStats.total === 0) return;

  const apiBaseUrl = await getApiBaseUrl();
  if (!apiBaseUrl) return;

  try {
    await fetch(`${apiBaseUrl}/api/auto-submit/submission-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        type: "summary",
        data: { ...currentBatchStats },
      }),
    });
  } catch (err) {
    console.error("[Background] Failed to send batch summary:", err);
  }

  // 統計をリセット
  currentBatchStats.total = 0;
  currentBatchStats.success = 0;
  currentBatchStats.failed = 0;
  currentBatchStats.categories = {};
}

// 送信結果をAPIに報告
async function reportResultToApi(
  leadId: string,
  status: "success" | "failed" | "blocked",
  error?: string,
): Promise<void> {
  const apiBaseUrl = await getApiBaseUrl();
  if (!apiBaseUrl) {
    console.log(
      "[Background] No API base URL configured, skipping result report for leadId:",
      leadId,
    );
    return;
  }

  const payload = {
    results: [
      {
        leadId,
        status,
        error,
        sentAt: new Date().toISOString(),
      },
    ],
  };

  console.log(`[Background] Reporting result to API:`, {
    apiBaseUrl,
    leadId,
    status,
    error: error?.substring(0, 100),
  });

  try {
    const response = await fetch(`${apiBaseUrl}/api/leads/update-send-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // Cookieを送信してサーバー側で認証
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[Background] ✅ Result reported successfully:`, {
        leadId,
        status,
        apiResponse: data,
      });
    } else {
      const errorText = await response
        .text()
        .catch(() => "Unable to read error");
      console.error(`[Background] ❌ API returned error:`, {
        leadId,
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
    }
  } catch (err) {
    console.error("[Background] ❌ Failed to report result to API:", {
      leadId,
      error: err instanceof Error ? err.message : String(err),
      apiBaseUrl,
    });
  }
}

// 外部からの接続（Next.jsアプリからの接続）
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    console.log("[Background] External message received:", message.type);

    (async () => {
      try {
        switch (message.type) {
          case "ADD_BATCH":
            // APIベースURLを保存（送信元のオリジンを使用）
            if (sender.origin) {
              await setApiBaseUrl(sender.origin);
              console.log(`[Background] API base URL set to: ${sender.origin}`);
            }

            // バッチでキューに追加
            let addedCount = 0;
            for (const item of message.items) {
              try {
                await queueManager.addItem(item);
                addedCount++;
              } catch (err) {
                console.error("[Background] Failed to add item:", err);
              }
            }
            sendResponse({ success: true, count: addedCount });

            // Side Panelを開く（ユーザーに進捗を見せる）
            await openSidePanel();

            // 処理開始（並行数の上限まで即座に起動）
            console.log(
              `[Background] Starting queue processing for ${addedCount} items`,
            );
            setTimeout(() => startNextProcesses(), 500);
            break;

          case "GET_STATUS":
            const items = await queueManager.getAllItems();
            const processing = items.filter(
              (i) => i.status === "processing",
            ).length;
            const pending = items.filter((i) => i.status === "pending").length;
            const completed = items.filter(
              (i) => i.status === "completed",
            ).length;
            const failed = items.filter((i) => i.status === "failed").length;

            sendResponse({
              success: true,
              data: { processing, pending, completed, failed, items },
            });
            break;

          case "PING":
            sendResponse({ success: true, message: "pong", version: "1.2.0" });
            break;

          case "GET_LOGS":
            // デバッグログを返す
            sendResponse({ success: true, logs: contentLogs.slice(-100) });
            break;

          case "CLEAR_COMPLETED":
            await queueManager.clearCompleted();
            sendResponse({ success: true });
            break;

          case "GET_MAX_CONCURRENT":
            const currentMaxConcurrent = await getMaxConcurrent();
            sendResponse({
              success: true,
              maxConcurrent: currentMaxConcurrent,
            });
            break;

          case "SET_MAX_CONCURRENT":
            const requestedMaxConcurrent = message.maxConcurrent;
            const parsedMaxConcurrent =
              typeof requestedMaxConcurrent === "number"
                ? requestedMaxConcurrent
                : Number(requestedMaxConcurrent);
            if (
              Number.isFinite(parsedMaxConcurrent) &&
              parsedMaxConcurrent >= 1 &&
              parsedMaxConcurrent <= 10
            ) {
              await chrome.storage.local.set({
                maxConcurrent: parsedMaxConcurrent,
              });
              console.log(
                `[Background] Max concurrent set to: ${parsedMaxConcurrent}`,
              );
              sendResponse({
                success: true,
                maxConcurrent: parsedMaxConcurrent,
              });
            } else {
              sendResponse({
                success: false,
                error: "Invalid maxConcurrent value",
              });
            }
            break;

          case "SEARCH_CONTACT_FORMS": {
            // お問い合わせフォームURL多階層検索
            const urls = message.urls as string[] | undefined;
            if (!Array.isArray(urls) || urls.length === 0) {
              sendResponse({
                success: false,
                error: "urls は1件以上の配列で指定してください",
              });
              break;
            }
            if (urls.length > 100) {
              sendResponse({
                success: false,
                error: "一度に検索できるURLは100件までです",
              });
              break;
            }

            console.log(
              `[Background] SEARCH_CONTACT_FORMS: ${urls.length} URLs`,
            );

            // 並行制御して検索実行
            const maxC = await getMaxConcurrent();
            const searchResults = await searchContactFormsDeep(urls, maxC);
            sendResponse({ success: true, results: searchResults });
            break;
          }

          default:
            sendResponse({ success: false, error: "Unknown message type" });
        }
      } catch (error) {
        console.error("[Background] External error:", error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    })();

    return true;
  },
);

// キューの次のアイテムを処理（並行数制限付き）
async function processNextItem(): Promise<void> {
  // 並行数を取得
  const maxConcurrent = await getMaxConcurrent();

  // 現在処理中のアイテム数を確認
  const processingItems = await queueManager.getItemsByStatus("processing");
  if (processingItems.length >= maxConcurrent) {
    console.log(
      `[Background] Already processing ${processingItems.length}/${maxConcurrent} items`,
    );
    return;
  }

  // アトミックに次のアイテムを取得してロック
  const nextItem = await queueManager.getAndLockNextPendingItem();
  if (!nextItem) {
    console.log("[Background] No pending items in queue");
    return;
  }

  console.log(
    `[Background] Processing item: ${nextItem.id} (${nextItem.company}) [${processingItems.length + 1}/${maxConcurrent}]`,
  );
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "background/index.ts:213",
      message: "Starting to process queue item",
      data: {
        itemId: nextItem.id,
        company: nextItem.company,
        url: nextItem.url,
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      hypothesisId: "E",
    }),
  }).catch(() => {});
  // #endregion

  let tab: chrome.tabs.Tab | null = null;

  try {
    // 注: getAndLockNextPendingItem()で既にprocessingに更新済み

    // 新しいタブを開いてContent Scriptに処理を依頼
    tab = await chrome.tabs.create({
      url: nextItem.url,
      active: false, // バックグラウンドで開く
    });

    if (!tab.id) {
      throw new Error("Failed to create tab");
    }

    console.log(`[Background] Tab created: ${tab.id} for URL: ${nextItem.url}`);
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "background/index.ts:230",
        message: "Tab created",
        data: { tabId: tab.id, url: nextItem.url, company: nextItem.company },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "E",
      }),
    }).catch(() => {});
    // #endregion

    // タブの読み込み完了を待つ
    await waitForTabLoad(tab.id);
    console.log(`[Background] Tab loaded, checking for contact form`);
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "background/index.ts:239",
        message: "Tab loaded, checking for form",
        data: { tabId: tab.id, url: nextItem.url },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "F",
      }),
    }).catch(() => {});
    // #endregion

    // フォーム検索: URL検索と同じ多階層BFS検索を使用
    const { formUrl, searchLog, totalPagesChecked, initialLinksFound } =
      await findContactFormPageDeep(tab.id, nextItem.url);

    if (!formUrl) {
      // iframeフォームの存在を確認
      const hasIframeForm = searchLog.some((s) => (s.formIframeCount ?? 0) > 0);
      const hasExternalFormService = searchLog.some(
        (s) => s.hasExternalFormLoading,
      );

      const lines: string[] = [];
      if (hasIframeForm) {
        lines.push(
          `フォームが見つかりません（iframe内にフォームが存在する可能性があります）(${totalPagesChecked}ページ確認)`,
        );
      } else if (hasExternalFormService) {
        lines.push(
          `フォームが見つかりません（外部フォームサービスのスクリプトを検出しましたが、フォームが読み込まれませんでした）(${totalPagesChecked}ページ確認)`,
        );
      } else {
        lines.push(
          `フォームが見つかりません (${totalPagesChecked}ページ確認, ${initialLinksFound}件リンク検出)`,
        );
      }
      for (const step of searchLog) {
        const info: string[] = [];
        if (step.formCount != null) info.push(`form=${step.formCount}`);
        if (step.inputCount != null) info.push(`input=${step.inputCount}`);
        if (step.formScore != null) info.push(`score=${step.formScore}`);
        if (step.formIframeCount)
          info.push(`iframe_form=${step.formIframeCount}`);
        if (step.hasExternalFormLoading) info.push("ext_form_loading");
        if (step.pageClassification && step.pageClassification !== "allowed")
          info.push(`page=${step.pageClassification}`);
        if (step.hasCaptcha)
          info.push(
            `${step.captchaType ?? "CAPTCHA"}${step.captchaIsBlocker ? "(自動送信不可)" : ""}`,
          );
        if (step.error) info.push(`error=${step.error}`);
        const label =
          step.depth === 0
            ? "初期"
            : step.isExternal
              ? `外部`
              : `深さ${step.depth}`;
        lines.push(
          `  ${label}: ${step.url} → ${step.hasForm ? "フォーム有" : "フォーム無"} (${info.join(", ")})`,
        );
      }
      throw new Error(lines.join("\n"));
    }

    console.log(
      `[Background] Form found at: ${formUrl}, sending form submission request`,
    );

    // タブURL変化リスナーを登録（ページ遷移検出用）
    let navigationUrl: string | null = null;
    const urlChangeListener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      if (tab?.id && updatedTabId === tab.id && changeInfo.url) {
        navigationUrl = changeInfo.url;
        console.log(
          `[Background] Tab URL changed during form submission: ${changeInfo.url}`,
        );
      }
    };
    chrome.tabs.onUpdated.addListener(urlChangeListener);

    // フォーム送信中に別タブが開いた場合を検知して即時クローズ（タブ漏れ防止）
    const childTabIds = new Set<number>();
    const newTabListener = (newTab: chrome.tabs.Tab) => {
      if (newTab.openerTabId === tab?.id && newTab.id) {
        childTabIds.add(newTab.id);
        console.log(
          `[Background] Child tab detected during form submission: ${newTab.id} (${newTab.url})`,
        );
        // 子タブのURLを取得してから閉じる（成功URLかどうかの判定に使う）
        if (newTab.url) {
          navigationUrl = navigationUrl || newTab.url;
        }
        // 子タブは不要なので即座に閉じる
        chrome.tabs.remove(newTab.id).catch(() => {});
      }
    };
    chrome.tabs.onCreated.addListener(newTabListener);

    // Content Scriptにフォーム入力を依頼（タイムアウト付き）
    let result: {
      success: boolean;
      error?: string;
      finalUrl?: string;
      hasForm?: boolean;
      debugInfo?: Record<string, unknown>;
      debugLogs?: string[];
      candidates?: string[];
    };
    const FORM_SUBMIT_TIMEOUT_MS = 180000;
    const FORM_SUBMIT_TIMEOUT_LABEL = "3分";
    try {
      result = await Promise.race([
        sendMessageToTab(tab.id, {
          type: "FILL_AND_SUBMIT_FORM",
          payload: { ...nextItem, formUrl },
        }),
        new Promise<{
          success: false;
          error: string;
          finalUrl?: string;
          hasForm?: boolean;
          debugInfo?: Record<string, unknown>;
          debugLogs?: string[];
          candidates?: string[];
        }>((resolve) =>
          setTimeout(
            () =>
              resolve({
                success: false,
                error: `処理タイムアウト（${FORM_SUBMIT_TIMEOUT_LABEL}） - formUrl: ${formUrl || "unknown"}`,
              }),
            FORM_SUBMIT_TIMEOUT_MS,
          ),
        ),
      ]);

      // タイムアウトの場合、タブURLで成功判定を試みる
      if (!result.success && result.error?.includes("タイムアウト")) {
        console.log(
          `[Background] Timeout detected, checking tab URL for success recovery...`,
        );
        const successPatterns = SUCCESS_URL_PATTERNS;

        // まず onUpdated リスナーでキャプチャしたURLを確認
        let currentUrl = navigationUrl || "";
        if (!currentUrl) {
          try {
            const currentTab = await chrome.tabs.get(tab.id!);
            currentUrl = currentTab.url || "";
          } catch {
            // タブが閉じられている場合
          }
        }

        const urlChanged = currentUrl && currentUrl !== formUrl;
        if (urlChanged) {
          console.log(
            `[Background] URL changed from ${formUrl} to ${currentUrl}`,
          );

          if (
            successPatterns.some((p) => currentUrl.toLowerCase().includes(p))
          ) {
            console.log(
              `[Background] ✅ Timeout recovery: success URL detected: ${currentUrl}`,
            );
            result = { success: true, finalUrl: currentUrl };
          } else {
            // URLは変わったが成功パターンなし → ページテキストで確認
            try {
              await sleep(1000);
              const textResult = await Promise.race([
                sendMessageToTab(tab.id!, {
                  type: "CHECK_SUCCESS_TEXT",
                }),
                new Promise<null>((resolve) =>
                  setTimeout(() => resolve(null), 5000),
                ),
              ]);
              if (
                textResult &&
                (textResult as { isSuccess?: boolean }).isSuccess
              ) {
                console.log(
                  `[Background] ✅ Timeout recovery: success text detected on page: ${currentUrl}`,
                );
                result = { success: true, finalUrl: currentUrl };
              } else {
                console.log(
                  `[Background] Timeout recovery: no success indicators found`,
                );
              }
            } catch {
              console.log(
                `[Background] Timeout recovery: could not check page text`,
              );
            }
          }
        } else {
          console.log(
            `[Background] Timeout recovery: URL unchanged (${currentUrl || "unknown"})`,
          );
        }
      }
    } finally {
      chrome.tabs.onUpdated.removeListener(urlChangeListener);
      chrome.tabs.onCreated.removeListener(newTabListener);
      // 残存する子タブをすべて閉じる
      for (const childId of childTabIds) {
        chrome.tabs.remove(childId).catch(() => {});
      }
    }

    // タイムアウトで失敗のままならデバッグログ回収を試みる
    if (
      !result.success &&
      result.error?.includes("タイムアウト") &&
      !result.debugLogs
    ) {
      try {
        const debugResult = await Promise.race([
          sendMessageToTab(tab.id!, { type: "GET_DEBUG_LOGS" }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        if (
          debugResult &&
          (debugResult as { debugLogs?: string[] }).debugLogs
        ) {
          result = {
            ...result,
            debugLogs: (debugResult as { debugLogs: string[] }).debugLogs,
          };
          console.log(
            `[Background] Recovered ${result.debugLogs!.length} debug log entries after timeout`,
          );
        }
      } catch {
        console.log(`[Background] Could not recover debug logs after timeout`);
      }
    }

    console.log(`[Background] Form submission result:`, result);

    if (result.success) {
      console.log(
        `[Background] ✅ Item completed successfully: ${nextItem.company}`,
      );
      if (result.debugLogs) {
        console.log(
          `[Background] Logs:\n${result.debugLogs.slice(-10).join("\n")}`,
        );
      }
      // APIに成功を報告（DB更新を先に行う → フロントエンドのfetchLeadsより必ず先に完了させる）
      await reportResultToApi(nextItem.leadId, "success");
      // キューステータスを更新（reportResultToApi完了後に変更することでrace conditionを防ぐ）
      await queueManager.updateItemStatus(nextItem.id, "completed", {
        completedAt: new Date().toISOString(),
        finalUrl: result.finalUrl,
        debugLogs: result.debugLogs?.join("\n"),
      });
      // 詳細ログを送信
      await sendSubmissionLog({
        status: "success",
        company: nextItem.company,
        targetUrl: nextItem.url,
        formUrl: formUrl || undefined,
        finalUrl: result.finalUrl,
        debugLogs: result.debugLogs,
        debugInfo: result.debugInfo as Record<string, unknown> | undefined,
        validationInfo: (result as Record<string, unknown>).validationInfo as
          | { phase: string; errors: { field: string; message: string }[] }[]
          | undefined,
      });
    } else {
      const errorMsg =
        result.error ||
        "送信結果不明（Content Scriptからのレスポンスにエラー情報なし）";
      const debugInfo = result.debugInfo
        ? JSON.stringify(result.debugInfo, null, 2)
        : "";
      console.log(
        `[Background] ❌ Item failed: ${nextItem.company} - ${errorMsg}`,
      );
      if (result.debugLogs) {
        console.log(`[Background] Debug logs:\n${result.debugLogs.join("\n")}`);
      }
      if (debugInfo) {
        console.log(`[Background] Debug info: ${debugInfo}`);
      }
      const failCat = classifyFailure(errorMsg);
      const apiStatus =
        failCat === "CAPTCHA_BLOCKED" || failCat === "FORM_NOT_FOUND"
          ? ("blocked" as const)
          : ("failed" as const);
      await reportResultToApi(nextItem.leadId, apiStatus, errorMsg);
      await queueManager.updateItemStatus(nextItem.id, "failed", {
        error: errorMsg,
        failedAt: new Date().toISOString(),
        debugLogs: result.debugLogs?.join("\n"),
        debugInfo,
      });
      await sendSubmissionLog({
        status: "failed",
        company: nextItem.company,
        targetUrl: nextItem.url,
        formUrl: formUrl || undefined,
        finalUrl: result.finalUrl,
        error: errorMsg,
        debugLogs: result.debugLogs,
        debugInfo: result.debugInfo as Record<string, unknown> | undefined,
        validationInfo: (result as Record<string, unknown>).validationInfo as
          | { phase: string; errors: { field: string; message: string }[] }[]
          | undefined,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[Background] Processing error for ${nextItem.company}:`,
      errorMessage,
    );

    const catchFailCat = classifyFailure(errorMessage);
    const catchApiStatus =
      catchFailCat === "CAPTCHA_BLOCKED" || catchFailCat === "FORM_NOT_FOUND"
        ? ("blocked" as const)
        : ("failed" as const);
    await reportResultToApi(nextItem.leadId, catchApiStatus, errorMessage);
    await queueManager.updateItemStatus(nextItem.id, "failed", {
      error: errorMessage,
      failedAt: new Date().toISOString(),
    });
    // 詳細ログを送信
    await sendSubmissionLog({
      status: "failed",
      company: nextItem.company,
      targetUrl: nextItem.url,
      error: errorMessage,
    });
  } finally {
    // タブを閉じる
    if (tab?.id) {
      try {
        await chrome.tabs.remove(tab.id);
        console.log(`[Background] Tab closed: ${tab.id}`);
      } catch (err) {
        console.log(`[Background] Tab already closed or error closing:`, err);
      }
    }
  }

  // キューが空なら成功率サマリーを出力
  const stats = await queueManager.getStats();
  if (
    stats.pending === 0 &&
    stats.processing === 0 &&
    currentBatchStats.total > 0
  ) {
    await sendBatchSummary();
  }

  // 次のアイテムを処理（並行数の上限まで）
  setTimeout(() => startNextProcesses(), 1000);
}

// 並行数の上限まで処理を開始
async function startNextProcesses(): Promise<void> {
  const maxConcurrent = await getMaxConcurrent();
  const processingItems = await queueManager.getItemsByStatus("processing");
  const slotsAvailable = maxConcurrent - processingItems.length;

  if (slotsAvailable <= 0) {
    console.log(
      `[Background] startNextProcesses: already at max (${processingItems.length}/${maxConcurrent})`,
    );
    return;
  }

  console.log(
    `[Background] startNextProcesses: launching up to ${slotsAvailable} items (maxConcurrent=${maxConcurrent}, processing=${processingItems.length})`,
  );

  for (let i = 0; i < slotsAvailable; i++) {
    const pending = await queueManager.getItemsByStatus("pending");
    if (pending.length === 0) break;

    // 各処理は非同期で並行に開始（awaitしない）
    processNextItem().catch((err) =>
      console.error("[Background] Process error:", err),
    );
    // 少し間隔を空ける（タブ作成の競合を避けるため）
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// タブにメッセージを送信（明示的Content Script注入 + READYハンドシェイク付き）
async function sendMessageToTab(
  tabId: number,
  message: Record<string, unknown>,
  retries = 3,
): Promise<{
  success: boolean;
  finalUrl?: string;
  error?: string;
  hasForm?: boolean;
  debugInfo?: Record<string, unknown>;
  debugLogs?: string[];
  candidates?: string[];
  links?: { url: string; text: string; isExternal: boolean }[];
  opened?: boolean;
  clickedText?: string;
  urlChanged?: boolean;
}> {
  console.log(
    `[Background] sendMessageToTab: tabId=${tabId}, type=${message.type}`,
  );

  const ensureContentScriptReady = async (
    context: string,
    pingAttempts = 3,
  ): Promise<boolean> => {
    // 1. 明示的にContent Scriptを注入（ページ遷移後の確実な注入）
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["src/content/formHandler.js"],
      });
      console.log(
        `[Background] Content Script injected successfully for tab ${tabId} (${context})`,
      );
    } catch (injectError) {
      console.log(
        `[Background] Content Script injection failed (may already be injected) (${context}):`,
        injectError,
      );
      // 既に注入されている場合はエラーになるが、続行
    }

    // 2. READYハンドシェイク: Content Scriptが準備完了かを確認
    for (let pingAttempt = 1; pingAttempt <= pingAttempts; pingAttempt++) {
      try {
        const pingResult = await chrome.tabs.sendMessage(tabId, {
          type: "PING_CONTENT",
        });
        if (pingResult?.ready) {
          console.log(
            `[Background] Content Script READY confirmed on attempt ${pingAttempt}/${pingAttempts} (${context})`,
          );
          return true;
        }
      } catch (pingError) {
        console.log(
          `[Background] PING attempt ${pingAttempt}/${pingAttempts} failed (${context}):`,
          pingError,
        );
        await sleep(500);
      }
    }

    return false;
  };

  const contentReady = await ensureContentScriptReady("initial", 3);
  if (!contentReady) {
    console.log(`[Background] Content Script not ready after 3 PING attempts`);
    return {
      success: false,
      error: "Content Scriptが応答しません（注入失敗の可能性）",
      finalUrl: undefined,
      hasForm: undefined,
      debugInfo: undefined,
      debugLogs: undefined,
      candidates: undefined,
    };
  }

  // 3. 実際のメッセージを送信
  const isFillAndSubmitMessage = message.type === "FILL_AND_SUBMIT_FORM";
  const PER_ATTEMPT_TIMEOUT_MS = isFillAndSubmitMessage ? 180000 : 100000;
  const timeoutLabel = isFillAndSubmitMessage ? "180秒" : "100秒";
  let lastErrorMessage = "";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await Promise.race([
        chrome.tabs.sendMessage(tabId, message),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`sendMessage内部タイムアウト（${timeoutLabel}）`),
              ),
            PER_ATTEMPT_TIMEOUT_MS,
          ),
        ),
      ]);
      console.log(`[Background] Message sent successfully:`, {
        tabId,
        attempt,
        messageType: message.type,
        resultSuccess: result?.success,
      });
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      lastErrorMessage = errorMsg;
      console.log(
        `[Background] Message attempt ${attempt}/${retries} failed:`,
        error,
      );

      // ページ遷移 or 内部タイムアウトの場合、送信成功の可能性がある
      const isNavigationOrTimeout =
        errorMsg.includes("back/forward cache") ||
        errorMsg.includes("message channel closed") ||
        errorMsg.includes("Receiving end does not exist") ||
        errorMsg.includes("sendMessage内部タイムアウト");

      if (isNavigationOrTimeout) {
        const successPatterns = SUCCESS_URL_PATTERNS;

        // 現在のページが成功ページかチェック
        let currentUrl = "";
        try {
          const tab = await chrome.tabs.get(tabId);
          currentUrl = tab.url || "";

          if (
            successPatterns.some((p) => currentUrl.toLowerCase().includes(p))
          ) {
            console.log(
              `[Background] Page transitioned to success page: ${currentUrl}`,
            );
            return {
              success: true,
              finalUrl: currentUrl,
              error: undefined,
              hasForm: undefined,
              debugInfo: undefined,
              debugLogs: undefined,
              candidates: undefined,
            };
          }
        } catch (tabError) {
          console.log(`[Background] Could not check tab URL:`, tabError);
        }

        // TRY_OPEN_CONTACT_UIはクリック後のページ遷移でチャネルが切れることがある
        // この場合はCTA起動成功として扱い、呼び出し元で再チェックさせる
        if (message.type === "TRY_OPEN_CONTACT_UI" && currentUrl) {
          console.log(
            `[Background] TRY_OPEN_CONTACT_UI: channel closed after click, treating as opened (url=${currentUrl})`,
          );
          return {
            success: true,
            opened: true,
            urlChanged: true,
            finalUrl: currentUrl,
            error: undefined,
            hasForm: undefined,
            debugInfo: undefined,
            debugLogs: undefined,
            candidates: undefined,
          };
        }

        // FILL_AND_SUBMIT_FORMの場合: URLが変化していればページ遷移発生済み
        // リトライすると確認ページに再入力するループになるので、成功テキストを確認して終了する
        if (message.type === "FILL_AND_SUBMIT_FORM" && currentUrl) {
          const originalUrl = (message.payload as Record<string, unknown>)
            ?.formUrl as string | undefined;
          const urlChanged = originalUrl ? currentUrl !== originalUrl : false;

          if (urlChanged) {
            console.log(
              `[Background] FILL_AND_SUBMIT_FORM: URL changed (${originalUrl} → ${currentUrl}), checking success text...`,
            );
            // 2秒待ってページ読み込みを確認
            await sleep(2000);
            try {
              const latestTab = await chrome.tabs.get(tabId);
              const latestUrl = latestTab.url || "";
              if (
                successPatterns.some((p) => latestUrl.toLowerCase().includes(p))
              ) {
                console.log(
                  `[Background] ✅ Success URL detected after wait: ${latestUrl}`,
                );
                return {
                  success: true,
                  finalUrl: latestUrl,
                  error: undefined,
                  hasForm: undefined,
                  debugInfo: undefined,
                  debugLogs: undefined,
                  candidates: undefined,
                };
              }
            } catch {
              /* ignore */
            }

            // Content Script を再注入して成功テキスト確認
            const csReady = await ensureContentScriptReady(
              "post-navigation-recovery",
              3,
            );
            if (csReady) {
              // まず成功テキストを確認
              try {
                const textResult = await Promise.race([
                  chrome.tabs.sendMessage(tabId, {
                    type: "CHECK_SUCCESS_TEXT",
                  }),
                  new Promise<null>((resolve) =>
                    setTimeout(() => resolve(null), 5000),
                  ),
                ]);
                if (
                  textResult &&
                  (textResult as { isSuccess?: boolean }).isSuccess
                ) {
                  const finalTab = await chrome.tabs
                    .get(tabId)
                    .catch(() => null);
                  console.log(
                    `[Background] ✅ Success text detected after URL change`,
                  );
                  return {
                    success: true,
                    finalUrl: finalTab?.url || currentUrl,
                    error: undefined,
                    hasForm: undefined,
                    debugInfo: undefined,
                    debugLogs: undefined,
                    candidates: undefined,
                  };
                }
              } catch {
                /* ignore */
              }

              // 成功テキストなし → 確認ページの可能性がある
              // 確認ページなら最終送信ボタンをクリックする
              console.log(
                `[Background] No success text found, attempting confirmation page handling...`,
              );
              try {
                const confirmResult = (await Promise.race([
                  chrome.tabs.sendMessage(tabId, {
                    type: "HANDLE_CONFIRMATION_PAGE",
                  }),
                  new Promise<null>((resolve) =>
                    setTimeout(() => resolve(null), 30000),
                  ),
                ])) as {
                  success?: boolean;
                  finalUrl?: string;
                  error?: string;
                } | null;

                if (confirmResult?.success) {
                  // 確認ページ処理後、ページ遷移が発生する可能性がある
                  await sleep(2000);
                  const finalTab = await chrome.tabs
                    .get(tabId)
                    .catch(() => null);
                  const finalUrl =
                    finalTab?.url || confirmResult.finalUrl || currentUrl;
                  console.log(
                    `[Background] ✅ Confirmation page handled successfully: ${finalUrl}`,
                  );
                  return {
                    success: true,
                    finalUrl,
                    error: undefined,
                    hasForm: undefined,
                    debugInfo: undefined,
                    debugLogs: undefined,
                    candidates: undefined,
                  };
                }
                console.log(
                  `[Background] Confirmation page handling did not succeed: ${confirmResult?.error || "no result"}`,
                );
              } catch (confirmError) {
                // HANDLE_CONFIRMATION_PAGE 中にページ遷移した場合 = 送信ボタンがクリックされた可能性が高い
                const confirmErrorMsg =
                  confirmError instanceof Error
                    ? confirmError.message
                    : String(confirmError);
                if (
                  confirmErrorMsg.includes("message channel closed") ||
                  confirmErrorMsg.includes("Receiving end does not exist")
                ) {
                  await sleep(3000);
                  const finalTab = await chrome.tabs
                    .get(tabId)
                    .catch(() => null);
                  const finalUrl = finalTab?.url || "";
                  if (
                    finalUrl &&
                    successPatterns.some((p) =>
                      finalUrl.toLowerCase().includes(p),
                    )
                  ) {
                    console.log(
                      `[Background] ✅ Success page after confirmation page submit: ${finalUrl}`,
                    );
                    return {
                      success: true,
                      finalUrl,
                      error: undefined,
                      hasForm: undefined,
                      debugInfo: undefined,
                      debugLogs: undefined,
                      candidates: undefined,
                    };
                  }
                  // 遷移したが成功確認できない → 再度Content Script注入して確認
                  const csReady2 = await ensureContentScriptReady(
                    "post-confirm-submit",
                    2,
                  );
                  if (csReady2) {
                    try {
                      const textResult2 = await Promise.race([
                        chrome.tabs.sendMessage(tabId, {
                          type: "CHECK_SUCCESS_TEXT",
                        }),
                        new Promise<null>((resolve) =>
                          setTimeout(() => resolve(null), 5000),
                        ),
                      ]);
                      if (
                        textResult2 &&
                        (textResult2 as { isSuccess?: boolean }).isSuccess
                      ) {
                        const ft = await chrome.tabs
                          .get(tabId)
                          .catch(() => null);
                        console.log(
                          `[Background] ✅ Success text after confirmation submit`,
                        );
                        return {
                          success: true,
                          finalUrl: ft?.url || finalUrl,
                          error: undefined,
                          hasForm: undefined,
                          debugInfo: undefined,
                          debugLogs: undefined,
                          candidates: undefined,
                        };
                      }
                    } catch {
                      /* ignore */
                    }
                  }
                  // 確認ページで送信ボタンをクリック後ページ遷移したなら送信は成功している可能性が高い
                  console.log(
                    `[Background] ✅ Treating as success: confirmation page submit caused navigation to ${finalUrl}`,
                  );
                  return {
                    success: true,
                    finalUrl: finalUrl || currentUrl,
                    error: undefined,
                    hasForm: undefined,
                    debugInfo: undefined,
                    debugLogs: undefined,
                    candidates: undefined,
                  };
                }
                console.log(
                  `[Background] Confirmation page error: ${confirmErrorMsg}`,
                );
              }
            }

            // URL変化+フォーム消失なら成功とみなす追加判定
            if (csReady) {
              try {
                const formCheckResult = (await Promise.race([
                  chrome.tabs.sendMessage(tabId, { type: "CHECK_FOR_FORM" }),
                  new Promise<null>((resolve) =>
                    setTimeout(() => resolve(null), 5000),
                  ),
                ])) as { hasForm?: boolean } | null;
                if (formCheckResult && !formCheckResult.hasForm) {
                  const ft = await chrome.tabs.get(tabId).catch(() => null);
                  console.log(
                    `[Background] ✅ URL changed and form disappeared, treating as success: ${ft?.url || currentUrl}`,
                  );
                  return {
                    success: true,
                    finalUrl: ft?.url || currentUrl,
                    error: undefined,
                    hasForm: undefined,
                    debugInfo: undefined,
                    debugLogs: undefined,
                    candidates: undefined,
                  };
                }
              } catch {
                /* ignore */
              }
            }

            return {
              success: false,
              error: `フォーム送信後ページ遷移しましたが成功確認できません (${currentUrl})`,
              finalUrl: currentUrl,
              hasForm: undefined,
              debugInfo: undefined,
              debugLogs: undefined,
              candidates: undefined,
            };
          }
          // URL変化なし → form filling中のタイムアウト → リトライしない
          if (errorMsg.includes("sendMessage内部タイムアウト")) {
            console.log(
              `[Background] FILL_AND_SUBMIT_FORM: internal timeout, URL unchanged, skipping retry`,
            );
            return {
              success: false,
              error: `フォーム入力中にタイムアウト（URLは変化なし） - ${currentUrl}`,
              finalUrl: undefined,
              hasForm: undefined,
              debugInfo: undefined,
              debugLogs: undefined,
              candidates: undefined,
            };
          }
        }
      }

      // 通信チャネル切断系は、再注入+READY確認後に再試行すると復旧できることがある
      const isRecoverableChannelError =
        errorMsg.includes("back/forward cache") ||
        errorMsg.includes("message channel closed") ||
        errorMsg.includes("Receiving end does not exist");
      if (isRecoverableChannelError && attempt < retries) {
        console.log(
          `[Background] Message channel issue detected, attempting content script recovery before retry...`,
        );
        const recovered = await ensureContentScriptReady(
          `recovery-attempt-${attempt}`,
          2,
        );
        if (recovered) {
          await sleep(500);
          continue;
        }
      }

      if (attempt < retries) {
        await sleep(1000);
      }
    }
  }
  // 最終リカバリ: タブを再読み込みして再注入後に1回だけ再送
  if (message.type !== "PING_CONTENT") {
    try {
      console.log(
        `[Background] Attempting final reload recovery for tab=${tabId}, type=${message.type}`,
      );
      await chrome.tabs.reload(tabId);
      await Promise.race([
        waitForTabLoad(tabId),
        sleep(15000).then(() => {
          throw new Error("recovery reload timeout");
        }),
      ]);

      const recovered = await ensureContentScriptReady(
        "final-reload-recovery",
        2,
      );
      if (recovered) {
        const recoveryResult = await Promise.race([
          chrome.tabs.sendMessage(tabId, message),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(`sendMessage内部タイムアウト（${timeoutLabel}）`),
                ),
              PER_ATTEMPT_TIMEOUT_MS,
            ),
          ),
        ]);
        console.log(
          `[Background] Final reload recovery succeeded: tab=${tabId}, type=${message.type}`,
        );
        return recoveryResult;
      }

      lastErrorMessage = `${lastErrorMessage || "unknown"} | final-recovery: content script not ready`;
    } catch (recoveryError) {
      const recoveryMsg =
        recoveryError instanceof Error
          ? recoveryError.message
          : String(recoveryError);
      lastErrorMessage = `${lastErrorMessage || "unknown"} | final-recovery: ${recoveryMsg}`;
      console.log(`[Background] Final reload recovery failed:`, recoveryError);
    }
  }

  const compactError = lastErrorMessage
    ? lastErrorMessage.replace(/\s+/g, " ").slice(0, 220)
    : "";
  return {
    success: false,
    error: compactError
      ? `Content Scriptとの通信に失敗しました (${compactError})`
      : "Content Scriptとの通信に失敗しました",
    finalUrl: undefined,
    hasForm: undefined,
    debugInfo: undefined,
    debugLogs: undefined,
    candidates: undefined,
  };
}

// タブの読み込み完了を待つ
async function waitForTabLoad(tabId: number): Promise<void> {
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "background/index.ts:334",
      message: "waitForTabLoad started",
      data: { tabId: tabId },
      timestamp: Date.now(),
      sessionId: "debug-session",
      hypothesisId: "B",
    }),
  }).catch(() => {});
  // #endregion

  // まず現在のタブの状態を確認（競合状態を回避）
  const tab = await chrome.tabs.get(tabId);
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "background/index.ts:343",
      message: "Tab status checked",
      data: { tabId: tabId, status: tab.status, url: tab.url },
      timestamp: Date.now(),
      sessionId: "debug-session",
      hypothesisId: "B",
    }),
  }).catch(() => {});
  // #endregion

  if (tab.status === "complete") {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "background/index.ts:350",
        message: "Tab already complete, waiting 2s",
        data: { tabId: tabId },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "B",
      }),
    }).catch(() => {});
    // #endregion
    await sleep(2000);
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "background/index.ts:356",
        message: "waitForTabLoad completed (already loaded)",
        data: { tabId: tabId },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "B",
      }),
    }).catch(() => {});
    // #endregion
    return;
  }

  // タブがまだ読み込み中の場合、リスナーで待つ
  return new Promise((resolve, reject) => {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "background/index.ts:366",
        message: "Tab still loading, adding listener",
        data: { tabId: tabId },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "B",
      }),
    }).catch(() => {});
    // #endregion

    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "background/index.ts:374",
            message: "Tab load timeout",
            data: { tabId: tabId },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "B",
          }),
        },
      ).catch(() => {});
      // #endregion
      reject(new Error("Tab load timeout (60s)"));
    }, 60000); // 60秒のタイムアウト

    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "background/index.ts:385",
            message: "Tab update event",
            data: {
              updatedTabId: updatedTabId,
              targetTabId: tabId,
              status: changeInfo.status,
              url: changeInfo.url,
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "B",
          }),
        },
      ).catch(() => {});
      // #endregion

      if (updatedTabId === tabId && changeInfo.status === "complete") {
        // #region agent log
        fetch(
          "http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "background/index.ts:392",
              message: "Tab load complete event received",
              data: { tabId: tabId },
              timestamp: Date.now(),
              sessionId: "debug-session",
              hypothesisId: "B",
            }),
          },
        ).catch(() => {});
        // #endregion
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        // DOMが安定するまで少し待つ
        setTimeout(() => {
          // #region agent log
          fetch(
            "http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                location: "background/index.ts:401",
                message: "waitForTabLoad completed (after waiting)",
                data: { tabId: tabId },
                timestamp: Date.now(),
                sessionId: "debug-session",
                hypothesisId: "B",
              }),
            },
          ).catch(() => {});
          // #endregion
          resolve();
        }, 2000);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

// スリープ
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== お問い合わせフォームURL多階層検索 =====

interface SearchStepLog {
  url: string;
  depth: number;
  isExternal: boolean;
  hasForm: boolean;
  formScore?: number;
  formReasons?: string[];
  formCount?: number;
  inputCount?: number;
  linksFound?: number;
  linkUrls?: string[];
  error?: string;
  hasCaptcha?: boolean;
  captchaType?: string;
  captchaIsBlocker?: boolean;
  formIframeCount?: number;
  hasExternalFormLoading?: boolean;
  pageClassification?: string;
}

interface ContactFormSearchResult {
  sourceUrl: string;
  contactFormUrl: string | null;
  found: boolean;
  depth: number;
  error?: string;
  searchLog: SearchStepLog[];
  totalPagesChecked: number;
  initialLinksFound: number;
}

interface ContactLink {
  url: string;
  text: string;
  isExternal: boolean;
  tier?: "preferred" | "fallback" | "excluded";
}

async function pollForFormAppearance(
  tabId: number,
  maxMs: number = 8000,
  intervalMs: number = 500,
): Promise<{
  check: Record<string, unknown> | null;
  fc: number;
  ic: number;
  bestScore: number;
}> {
  let latestCheck: Record<string, unknown> | null = null;
  let fc = 0,
    ic = 0,
    bestScore = 0;
  let effectiveMaxMs = maxMs;
  let extendedOnce = false;
  const startTime = Date.now();

  while (Date.now() - startTime < effectiveMaxMs) {
    await sleep(intervalMs);
    const result = await sendMessageToTab(tabId, { type: "CHECK_FOR_FORM" });
    if (result) {
      latestCheck = result as Record<string, unknown>;
      const dbg = result.debugInfo as Record<string, unknown> | undefined;
      fc = (dbg?.formCount as number) ?? 0;
      ic = (dbg?.inputCount as number) ?? 0;
      bestScore = (dbg?.bestScore as number) ?? 0;
      if (result.hasForm) break;

      // HubSpot/Marketo等のスクリプトを検出したら待機延長（1回のみ）
      if (!extendedOnce && dbg?.hasExternalFormLoading) {
        const remaining = effectiveMaxMs - (Date.now() - startTime);
        if (remaining < 8000) {
          effectiveMaxMs = Math.min(effectiveMaxMs + 5000, maxMs + 8000);
          extendedOnce = true;
          console.log(
            `[Background] External form service detected, extending poll to ${effectiveMaxMs}ms`,
          );
        }
      }
    }
  }
  return { check: latestCheck, fc, ic, bestScore };
}

function shouldTryContactUiFallback(
  formCount: number,
  inputCount: number,
  bestScore: number,
): boolean {
  // DOM空ページに加えて、低スコアかつ入力要素がほぼ無いページもCTA展開を試す
  return (
    (formCount === 0 && inputCount === 0) ||
    (bestScore === 0 && inputCount <= 3)
  );
}

function buildDirectContactPathCandidates(baseUrl: string): ContactLink[] {
  const commonPaths = [
    "/contact",
    "/contact/",
    "/inquiry",
    "/inquiry/",
    "/inquiries",
    "/inquiries/",
    "/toiawase",
    "/toiawase/",
    "/otoiawase",
    "/otoiawase/",
    "/contact-us",
    "/contact-us/",
    "/contactus",
    "/contactus/",
    "/form",
    "/form/",
    "/support/contact",
    "/support/contact/",
  ];

  try {
    const base = new URL(baseUrl);
    const candidates = new Map<string, ContactLink>();
    for (const path of commonPaths) {
      const url = new URL(path, base.origin).toString();
      candidates.set(url, { url, text: "(direct-path)", isExternal: false });
    }
    return Array.from(candidates.values());
  } catch {
    return [];
  }
}

/**
 * 複数URLのお問い合わせフォームを多階層で検索する
 * 同一ドメイン: 最大3階層、外部ドメイン: 最大1階層
 * maxConcurrent 数のタブを並行利用
 */
async function searchContactFormsDeep(
  urls: string[],
  maxConcurrent: number,
): Promise<ContactFormSearchResult[]> {
  const results: ContactFormSearchResult[] = [];

  let index = 0;
  const processNext = async (): Promise<void> => {
    while (index < urls.length) {
      const currentIndex = index++;
      const url = urls[currentIndex];
      console.log(
        `[Background] SearchDeep [${currentIndex + 1}/${urls.length}]: ${url}`,
      );

      const result = await searchSingleUrlDeep(url);
      results.push(result);

      console.log(
        `[Background] SearchDeep [${currentIndex + 1}/${urls.length}]: ${result.found ? "Found" : "Not found"} (checked ${result.totalPagesChecked} pages, ${result.initialLinksFound} links found) ${result.contactFormUrl ?? ""}`,
      );
    }
  };

  const workers = Array.from(
    { length: Math.min(maxConcurrent, urls.length) },
    () => processNext(),
  );
  await Promise.all(workers);

  return results;
}

/**
 * 1つのURLについて多階層検索を実行（詳細ログ付き）
 */
async function searchSingleUrlDeep(
  sourceUrl: string,
): Promise<ContactFormSearchResult> {
  const MAX_DEPTH_SAME_DOMAIN = 3;
  const MAX_DEPTH_EXTERNAL = 1;
  const PAGE_TIMEOUT_MS = 10000;
  const TOTAL_TIMEOUT_MS = 60000;

  const visited = new Set<string>();
  visited.add(sourceUrl);

  const searchLog: SearchStepLog[] = [];
  let totalPagesChecked = 0;
  let initialLinksFound = 0;

  let tab: chrome.tabs.Tab | null = null;
  const startTime = Date.now();

  try {
    tab = await chrome.tabs.create({ url: sourceUrl, active: false });
    if (!tab.id) throw new Error("タブの作成に失敗しました");
    const tabId = tab.id;

    // ページ読み込み待ち
    await Promise.race([
      waitForTabLoad(tabId),
      sleep(PAGE_TIMEOUT_MS).then(() => {
        throw new Error("ページ読み込みタイムアウト");
      }),
    ]);

    // 初期ページでフォームチェック
    let initialCheck = await sendMessageToTab(tabId, {
      type: "CHECK_FOR_FORM",
    });
    totalPagesChecked++;

    // SPA対応: フォーム未検出ならポーリングで待機
    if (!initialCheck?.hasForm) {
      const dbg = initialCheck?.debugInfo as
        | Record<string, unknown>
        | undefined;
      let fc = (dbg?.formCount as number) ?? 0;
      let ic = (dbg?.inputCount as number) ?? 0;
      {
        const pollMs = fc === 0 && ic === 0 ? 8000 : 5000;
        console.log(
          `[Background] SPA recheck: polling up to ${pollMs / 1000}s for form on ${sourceUrl} (fc=${fc}, ic=${ic})`,
        );
        const pollResult = await pollForFormAppearance(tabId, pollMs);
        if (pollResult.check)
          initialCheck = pollResult.check as typeof initialCheck;
        fc = pollResult.fc;
        ic = pollResult.ic;
        const bestScore = pollResult.bestScore;

        if (
          !initialCheck?.hasForm &&
          shouldTryContactUiFallback(fc, ic, bestScore)
        ) {
          console.log(
            `[Background] SPA recovery: trying contact CTA click on ${sourceUrl}`,
          );
          const ctaResult = await sendMessageToTab(
            tabId,
            { type: "TRY_OPEN_CONTACT_UI" },
            2,
          );
          if (ctaResult?.opened) {
            if (ctaResult.urlChanged) {
              try {
                await waitForTabLoad(tabId);
              } catch {
                await sleep(1500);
              }
            } else {
              await sleep(1500);
            }
            const postCtaCheck = await sendMessageToTab(tabId, {
              type: "CHECK_FOR_FORM",
            });
            if (postCtaCheck) initialCheck = postCtaCheck;
          }
        }
      }
    }

    const initialDebug = initialCheck?.debugInfo as
      | Record<string, unknown>
      | undefined;
    const initialStepLog: SearchStepLog = {
      url: sourceUrl,
      depth: 0,
      isExternal: false,
      hasForm: !!initialCheck?.hasForm,
      formCount: (initialDebug?.formCount as number) ?? 0,
      inputCount: (initialDebug?.inputCount as number) ?? 0,
      formScore: (initialDebug?.bestScore as number) ?? undefined,
      formReasons: (initialDebug?.bestReasons as string[]) ?? undefined,
      hasCaptcha: (initialDebug?.hasCaptcha as boolean) ?? false,
      captchaType: (initialDebug?.captchaType as string | null) ?? undefined,
      captchaIsBlocker:
        (initialDebug?.captchaIsBlocker as boolean) ?? undefined,
      formIframeCount: (initialDebug?.formIframeCount as number) ?? undefined,
      hasExternalFormLoading:
        (initialDebug?.hasExternalFormLoading as boolean) ?? undefined,
      pageClassification:
        (initialDebug?.pageClassification as string) ?? undefined,
    };
    searchLog.push(initialStepLog);

    if (initialCheck?.hasForm) {
      return {
        sourceUrl,
        contactFormUrl: sourceUrl,
        found: true,
        depth: 0,
        searchLog,
        totalPagesChecked,
        initialLinksFound: 0,
      };
    }

    // お問い合わせリンクを収集（両方のソースを統合）
    const linksResult = await sendMessageToTab(tabId, {
      type: "FIND_CONTACT_LINKS",
    });
    const links: ContactLink[] =
      (linksResult?.links as ContactLink[] | undefined) ?? [];

    // findContactPageCandidatesも常に取得して統合（href属性ベースの検出を補完）
    const candidatesResult = await sendMessageToTab(tabId, {
      type: "FIND_CONTACT_PAGE",
    });
    const candidates = (candidatesResult?.candidates as string[]) ?? [];
    const linkUrls = new Set(links.map((l) => l.url));
    for (const c of candidates.slice(1)) {
      if (!visited.has(c) && !linkUrls.has(c)) {
        links.push({ url: c, text: "", isExternal: false, tier: "preferred" });
      }
    }

    // リンクが0件の場合、動的コンテンツの可能性があるので少し待ってリトライ
    if (links.length === 0) {
      console.log(
        `[Background] SearchDeep: No links found, retrying after 3s wait...`,
      );
      await sleep(3000);

      const retryLinksResult = await sendMessageToTab(tabId, {
        type: "FIND_CONTACT_LINKS",
      });
      const retryLinks =
        (retryLinksResult?.links as ContactLink[] | undefined) ?? [];
      for (const link of retryLinks) {
        if (!visited.has(link.url)) {
          links.push(link);
        }
      }

      if (links.length === 0) {
        const retryCandidates = await sendMessageToTab(tabId, {
          type: "FIND_CONTACT_PAGE",
        });
        const retryCands = (retryCandidates?.candidates as string[]) ?? [];
        for (const c of retryCands.slice(1)) {
          if (!visited.has(c)) {
            links.push({
              url: c,
              text: "",
              isExternal: false,
              tier: "preferred",
            });
          }
        }
      }
    }

    // それでもリンクが無い場合は、汎用的な問い合わせパスを直接探索候補に追加
    if (links.length === 0) {
      const beforeCount = links.length;
      const directCandidates = buildDirectContactPathCandidates(sourceUrl);
      for (const candidate of directCandidates) {
        if (!visited.has(candidate.url)) {
          links.push({ ...candidate, tier: "preferred" });
        }
      }
      const addedCount = links.length - beforeCount;
      if (addedCount > 0) {
        console.log(
          `[Background] SearchDeep: Added ${addedCount} direct-path candidates`,
        );
      }
    }

    // preferred と fallback に分離
    const preferredLinks = links.filter((l) => l.tier !== "fallback");
    const fallbackLinks = links.filter((l) => l.tier === "fallback");

    const preferredCount = preferredLinks.length;
    const fallbackCount = fallbackLinks.length;
    console.log(
      `[Background] SearchDeep: Links found: ${links.length} total (preferred=${preferredCount}, fallback=${fallbackCount})`,
    );

    initialLinksFound = links.length;
    initialStepLog.linksFound = links.length;
    initialStepLog.linkUrls = links.map(
      (l) =>
        `[${l.tier || "preferred"}] ${l.text ? l.text + ": " : ""}${l.url}${l.isExternal ? " (外部)" : ""}`,
    );

    // 2パス探索: preferred を全て探索してからfallback を探索
    let fallbackFormUrl: string | null = null;
    let fallbackFormDepth = -1;
    let fallbackSearchLog: SearchStepLog[] = [];

    for (const pass of ["preferred", "fallback"] as const) {
      const passLinks = pass === "preferred" ? preferredLinks : fallbackLinks;

      const passQueue: {
        url: string;
        depth: number;
        isExternal: boolean;
        tier: string;
      }[] = [];
      for (const link of passLinks) {
        if (!visited.has(link.url)) {
          visited.add(link.url);
          passQueue.push({
            url: link.url,
            depth: 1,
            isExternal: link.isExternal,
            tier: pass,
          });
        }
      }

      if (passQueue.length === 0) continue;

      // preferred パスでフォームが見つかった場合はfallback探索不要
      if (pass === "fallback" && fallbackFormUrl) {
        console.log(
          `[Background] SearchDeep: Skipping fallback pass, already have fallback form: ${fallbackFormUrl}`,
        );
        continue;
      }

      console.log(
        `[Background] SearchDeep: Starting ${pass} pass (${passQueue.length} links)`,
      );

      while (passQueue.length > 0) {
        if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
          console.log(
            `[Background] SearchDeep: Total timeout reached for ${sourceUrl}`,
          );
          break;
        }

        const current = passQueue.shift()!;

        const maxDepth = current.isExternal
          ? MAX_DEPTH_EXTERNAL
          : MAX_DEPTH_SAME_DOMAIN;
        if (current.depth > maxDepth) continue;

        console.log(
          `[Background] SearchDeep: Trying depth=${current.depth} [${current.tier}] ${current.isExternal ? "(external)" : "(same)"}: ${current.url}`,
        );

        const stepLog: SearchStepLog = {
          url: current.url,
          depth: current.depth,
          isExternal: current.isExternal,
          hasForm: false,
        };

        try {
          await chrome.tabs.update(tabId, { url: current.url });
          await Promise.race([
            waitForTabLoad(tabId),
            sleep(PAGE_TIMEOUT_MS).then(() => {
              throw new Error("timeout");
            }),
          ]);

          let formCheck = await sendMessageToTab(tabId, {
            type: "CHECK_FOR_FORM",
          });
          totalPagesChecked++;

          // SPA対応: フォーム未検出ならポーリングで待機
          if (!formCheck?.hasForm) {
            const dbg = formCheck?.debugInfo as
              | Record<string, unknown>
              | undefined;
            let fc = (dbg?.formCount as number) ?? 0;
            let ic = (dbg?.inputCount as number) ?? 0;
            {
              const pollMs = fc === 0 && ic === 0 ? 8000 : 5000;
              console.log(
                `[Background] SPA recheck: polling up to ${pollMs / 1000}s for form on ${current.url} (fc=${fc}, ic=${ic})`,
              );
              const pollResult = await pollForFormAppearance(tabId, pollMs);
              if (pollResult.check)
                formCheck = pollResult.check as typeof formCheck;
              fc = pollResult.fc;
              ic = pollResult.ic;
              const bestScore = pollResult.bestScore;

              if (
                !formCheck?.hasForm &&
                shouldTryContactUiFallback(fc, ic, bestScore)
              ) {
                console.log(
                  `[Background] SPA recovery: trying contact CTA click on ${current.url}`,
                );
                const ctaResult = await sendMessageToTab(
                  tabId,
                  { type: "TRY_OPEN_CONTACT_UI" },
                  2,
                );
                if (ctaResult?.opened) {
                  if (ctaResult.urlChanged) {
                    try {
                      await waitForTabLoad(tabId);
                    } catch {
                      await sleep(1500);
                    }
                  } else {
                    await sleep(1500);
                  }
                  const postCtaCheck = await sendMessageToTab(tabId, {
                    type: "CHECK_FOR_FORM",
                  });
                  if (postCtaCheck) formCheck = postCtaCheck;
                }
              }
            }
          }

          const debug = formCheck?.debugInfo as
            | Record<string, unknown>
            | undefined;
          stepLog.hasForm = !!formCheck?.hasForm;
          stepLog.formCount = (debug?.formCount as number) ?? 0;
          stepLog.inputCount = (debug?.inputCount as number) ?? 0;
          stepLog.formScore = (debug?.bestScore as number) ?? undefined;
          stepLog.formReasons = (debug?.bestReasons as string[]) ?? undefined;
          stepLog.hasCaptcha = (debug?.hasCaptcha as boolean) ?? false;
          stepLog.captchaType =
            (debug?.captchaType as string | null) ?? undefined;
          stepLog.captchaIsBlocker =
            (debug?.captchaIsBlocker as boolean) ?? undefined;

          if (formCheck?.hasForm) {
            searchLog.push(stepLog);

            if (pass === "preferred") {
              // preferred で見つかった → 即座に返す
              return {
                sourceUrl,
                contactFormUrl: current.url,
                found: true,
                depth: current.depth,
                searchLog,
                totalPagesChecked,
                initialLinksFound,
              };
            } else {
              // fallback で見つかった → 保存して探索終了
              fallbackFormUrl = current.url;
              fallbackFormDepth = current.depth;
              fallbackSearchLog = [...searchLog];
              console.log(
                `[Background] SearchDeep: Fallback form found at ${current.url}, saved for later use`,
              );
              break;
            }
          }

          // 同一ドメインでまだ深さに余裕がある場合、さらにリンクを収集
          // preferredリンクは1段深く探索可能
          const depthLimit =
            current.tier === "preferred"
              ? MAX_DEPTH_SAME_DOMAIN
              : MAX_DEPTH_SAME_DOMAIN - 1;
          if (!current.isExternal && current.depth < depthLimit) {
            const deepLinksResult = await sendMessageToTab(tabId, {
              type: "FIND_CONTACT_LINKS",
            });
            const deepLinks: ContactLink[] =
              (deepLinksResult?.links as ContactLink[] | undefined) ?? [];

            const newLinks: ContactLink[] = [];
            for (const link of deepLinks) {
              if (!visited.has(link.url)) {
                visited.add(link.url);
                newLinks.push(link);
                if (
                  pass === "preferred" &&
                  (link.tier === "preferred" || !link.tier)
                ) {
                  passQueue.push({
                    url: link.url,
                    depth: current.depth + 1,
                    isExternal: link.isExternal,
                    tier: link.tier || "preferred",
                  });
                }
              }
            }

            stepLog.linksFound = newLinks.length;
            if (newLinks.length > 0) {
              stepLog.linkUrls = newLinks.map(
                (l) =>
                  `[${l.tier || "preferred"}] ${l.text ? l.text + ": " : ""}${l.url}${l.isExternal ? " (外部)" : ""}`,
              );
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stepLog.error = msg;
          console.log(
            `[Background] SearchDeep: Error at ${current.url}: ${msg}`,
          );
        }

        searchLog.push(stepLog);
      }
    }

    // fallback で見つかったフォームがあればそれを返す
    if (fallbackFormUrl) {
      console.log(
        `[Background] SearchDeep: Using fallback form: ${fallbackFormUrl}`,
      );
      return {
        sourceUrl,
        contactFormUrl: fallbackFormUrl,
        found: true,
        depth: fallbackFormDepth,
        searchLog: fallbackSearchLog,
        totalPagesChecked,
        initialLinksFound,
      };
    }

    // 全て探索したが見つからなかった
    return {
      sourceUrl,
      contactFormUrl: null,
      found: false,
      depth: -1,
      searchLog,
      totalPagesChecked,
      initialLinksFound,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[Background] SearchDeep: Fatal error for ${sourceUrl}:`,
      msg,
    );
    return {
      sourceUrl,
      contactFormUrl: null,
      found: false,
      depth: -1,
      error: msg,
      searchLog,
      totalPagesChecked,
      initialLinksFound,
    };
  } finally {
    if (tab?.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // タブが既に閉じられている場合
      }
    }
  }
}

/**
 * フォームが存在するページを見つける（多階層BFS検索 — URL検索と同等のロジック）
 * 既存タブを再利用して探索する
 */
async function findContactFormPageDeep(
  tabId: number,
  initialUrl: string,
): Promise<{
  formUrl: string | null;
  searchLog: SearchStepLog[];
  totalPagesChecked: number;
  initialLinksFound: number;
}> {
  const MAX_DEPTH_SAME_DOMAIN = 3;
  const MAX_DEPTH_EXTERNAL = 1;
  const PAGE_TIMEOUT_MS = 10000;
  const TOTAL_TIMEOUT_MS = 60000;

  const visited = new Set<string>();
  visited.add(initialUrl);

  const searchLog: SearchStepLog[] = [];
  let totalPagesChecked = 0;
  let initialLinksFound = 0;

  const startTime = Date.now();

  console.log(
    `[Background] ===== FormPageDeep: Starting for ${initialUrl} =====`,
  );

  try {
    // 1. 初期ページでフォームチェック
    let initialCheck = await sendMessageToTab(tabId, {
      type: "CHECK_FOR_FORM",
    });
    totalPagesChecked++;

    // SPA対応: フォーム未検出ならポーリングで待機
    if (!initialCheck?.hasForm) {
      const dbg = initialCheck?.debugInfo as
        | Record<string, unknown>
        | undefined;
      let fc = (dbg?.formCount as number) ?? 0;
      let ic = (dbg?.inputCount as number) ?? 0;
      {
        const pollMs = fc === 0 && ic === 0 ? 8000 : 5000;
        console.log(
          `[Background] FormPageDeep SPA recheck: polling up to ${pollMs / 1000}s for form on ${initialUrl} (fc=${fc}, ic=${ic})`,
        );
        const pollResult = await pollForFormAppearance(tabId, pollMs);
        if (pollResult.check)
          initialCheck = pollResult.check as typeof initialCheck;
        fc = pollResult.fc;
        ic = pollResult.ic;
        const bestScore = pollResult.bestScore;

        if (
          !initialCheck?.hasForm &&
          shouldTryContactUiFallback(fc, ic, bestScore)
        ) {
          console.log(
            `[Background] FormPageDeep SPA recovery: trying contact CTA click on ${initialUrl}`,
          );
          const ctaResult = await sendMessageToTab(
            tabId,
            { type: "TRY_OPEN_CONTACT_UI" },
            2,
          );
          if (ctaResult?.opened) {
            if (ctaResult.urlChanged) {
              try {
                await waitForTabLoad(tabId);
              } catch {
                await sleep(1500);
              }
            } else {
              await sleep(1500);
            }
            const postCtaCheck = await sendMessageToTab(tabId, {
              type: "CHECK_FOR_FORM",
            });
            if (postCtaCheck) initialCheck = postCtaCheck;
            // CTA遷移後の実際のURLを取得（formUrlを正確にするため）
            if (initialCheck?.hasForm && ctaResult.urlChanged) {
              const actualTab = await chrome.tabs.get(tabId).catch(() => null);
              const actualUrl = actualTab?.url || initialUrl;
              if (actualUrl !== initialUrl) {
                console.log(
                  `[Background] FormPageDeep: CTA navigated to ${actualUrl}, form found there`,
                );
                return {
                  formUrl: actualUrl,
                  searchLog,
                  totalPagesChecked,
                  initialLinksFound: 0,
                };
              }
            }
          }
        }
      }
    }

    const initialDebug = initialCheck?.debugInfo as
      | Record<string, unknown>
      | undefined;
    const initialStepLog: SearchStepLog = {
      url: initialUrl,
      depth: 0,
      isExternal: false,
      hasForm: !!initialCheck?.hasForm,
      formCount: (initialDebug?.formCount as number) ?? 0,
      inputCount: (initialDebug?.inputCount as number) ?? 0,
      formScore: (initialDebug?.bestScore as number) ?? undefined,
      formReasons: (initialDebug?.bestReasons as string[]) ?? undefined,
      hasCaptcha: (initialDebug?.hasCaptcha as boolean) ?? false,
      captchaType: (initialDebug?.captchaType as string | null) ?? undefined,
      captchaIsBlocker:
        (initialDebug?.captchaIsBlocker as boolean) ?? undefined,
      formIframeCount: (initialDebug?.formIframeCount as number) ?? undefined,
      hasExternalFormLoading:
        (initialDebug?.hasExternalFormLoading as boolean) ?? undefined,
      pageClassification:
        (initialDebug?.pageClassification as string) ?? undefined,
    };
    searchLog.push(initialStepLog);

    if (initialCheck?.hasForm) {
      console.log(`[Background] FormPageDeep: Form found on initial page`);
      return {
        formUrl: initialUrl,
        searchLog,
        totalPagesChecked,
        initialLinksFound: 0,
      };
    }

    // 2. リンク収集（両方のソースを統合）
    const linksResult = await sendMessageToTab(tabId, {
      type: "FIND_CONTACT_LINKS",
    });
    const links: ContactLink[] =
      (linksResult?.links as ContactLink[] | undefined) ?? [];

    const candidatesResult = await sendMessageToTab(tabId, {
      type: "FIND_CONTACT_PAGE",
    });
    const candidates = (candidatesResult?.candidates as string[]) ?? [];
    const linkUrls = new Set(links.map((l) => l.url));
    for (const c of candidates.slice(1)) {
      if (!visited.has(c) && !linkUrls.has(c)) {
        links.push({ url: c, text: "", isExternal: false, tier: "preferred" });
      }
    }

    // リトライ（動的コンテンツ対応）
    if (links.length === 0) {
      console.log(
        `[Background] FormPageDeep: No links found, retrying after 3s...`,
      );
      await sleep(3000);
      const retryLinksResult = await sendMessageToTab(tabId, {
        type: "FIND_CONTACT_LINKS",
      });
      const retryLinks =
        (retryLinksResult?.links as ContactLink[] | undefined) ?? [];
      for (const link of retryLinks) {
        if (!visited.has(link.url)) {
          links.push(link);
        }
      }
    }

    // それでもリンクが無い場合は、汎用的な問い合わせパスを直接探索候補に追加
    if (links.length === 0) {
      const beforeCount = links.length;
      const directCandidates = buildDirectContactPathCandidates(initialUrl);
      for (const candidate of directCandidates) {
        if (!visited.has(candidate.url)) {
          links.push({ ...candidate, tier: "preferred" });
        }
      }
      const addedCount = links.length - beforeCount;
      if (addedCount > 0) {
        console.log(
          `[Background] FormPageDeep: Added ${addedCount} direct-path candidates`,
        );
      }
    }

    // preferred と fallback に分離
    const preferredLinks = links.filter((l) => l.tier !== "fallback");
    const fallbackLinks = links.filter((l) => l.tier === "fallback");

    initialLinksFound = links.length;
    initialStepLog.linksFound = links.length;
    initialStepLog.linkUrls = links.map(
      (l) =>
        `[${l.tier || "preferred"}] ${l.text ? l.text + ": " : ""}${l.url}${l.isExternal ? " (外部)" : ""}`,
    );

    console.log(
      `[Background] FormPageDeep: ${links.length} links found (preferred=${preferredLinks.length}, fallback=${fallbackLinks.length})`,
    );

    // 3. 2パス探索: preferred を全て探索してからfallback を探索
    let fallbackFormUrl: string | null = null;

    for (const pass of ["preferred", "fallback"] as const) {
      const passLinks = pass === "preferred" ? preferredLinks : fallbackLinks;

      const passQueue: {
        url: string;
        depth: number;
        isExternal: boolean;
        tier: string;
      }[] = [];
      for (const link of passLinks) {
        if (!visited.has(link.url)) {
          visited.add(link.url);
          passQueue.push({
            url: link.url,
            depth: 1,
            isExternal: link.isExternal,
            tier: pass,
          });
        }
      }

      if (passQueue.length === 0) continue;
      if (pass === "fallback" && fallbackFormUrl) continue;

      console.log(
        `[Background] FormPageDeep: Starting ${pass} pass (${passQueue.length} links)`,
      );

      while (passQueue.length > 0) {
        if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
          console.log(`[Background] FormPageDeep: Total timeout reached`);
          break;
        }

        const current = passQueue.shift()!;
        const maxDepth = current.isExternal
          ? MAX_DEPTH_EXTERNAL
          : MAX_DEPTH_SAME_DOMAIN;
        if (current.depth > maxDepth) continue;

        console.log(
          `[Background] FormPageDeep: depth=${current.depth} [${current.tier}] ${current.isExternal ? "(external)" : ""}: ${current.url}`,
        );

        const stepLog: SearchStepLog = {
          url: current.url,
          depth: current.depth,
          isExternal: current.isExternal,
          hasForm: false,
        };

        try {
          await chrome.tabs.update(tabId, { url: current.url });
          await Promise.race([
            waitForTabLoad(tabId),
            sleep(PAGE_TIMEOUT_MS).then(() => {
              throw new Error("timeout");
            }),
          ]);

          let formCheck = await sendMessageToTab(tabId, {
            type: "CHECK_FOR_FORM",
          });
          totalPagesChecked++;

          // SPA対応: フォーム未検出ならポーリングで待機
          if (!formCheck?.hasForm) {
            const dbg = formCheck?.debugInfo as
              | Record<string, unknown>
              | undefined;
            let fc = (dbg?.formCount as number) ?? 0;
            let ic = (dbg?.inputCount as number) ?? 0;
            {
              const pollMs = fc === 0 && ic === 0 ? 8000 : 5000;
              console.log(
                `[Background] FormPageDeep SPA recheck: polling up to ${pollMs / 1000}s for form on ${current.url} (fc=${fc}, ic=${ic})`,
              );
              const pollResult = await pollForFormAppearance(tabId, pollMs);
              if (pollResult.check)
                formCheck = pollResult.check as typeof formCheck;
              fc = pollResult.fc;
              ic = pollResult.ic;
              const bestScore = pollResult.bestScore;

              if (
                !formCheck?.hasForm &&
                shouldTryContactUiFallback(fc, ic, bestScore)
              ) {
                console.log(
                  `[Background] FormPageDeep SPA recovery: trying contact CTA click on ${current.url}`,
                );
                const ctaResult = await sendMessageToTab(
                  tabId,
                  { type: "TRY_OPEN_CONTACT_UI" },
                  2,
                );
                if (ctaResult?.opened) {
                  if (ctaResult.urlChanged) {
                    try {
                      await waitForTabLoad(tabId);
                    } catch {
                      await sleep(1500);
                    }
                  } else {
                    await sleep(1500);
                  }
                  const postCtaCheck = await sendMessageToTab(tabId, {
                    type: "CHECK_FOR_FORM",
                  });
                  if (postCtaCheck) formCheck = postCtaCheck;
                  if (formCheck?.hasForm && ctaResult.urlChanged) {
                    const actualTab = await chrome.tabs
                      .get(tabId)
                      .catch(() => null);
                    const actualUrl = actualTab?.url || current.url;
                    if (actualUrl !== current.url) {
                      console.log(
                        `[Background] FormPageDeep: CTA navigated to ${actualUrl}, form found there`,
                      );
                      searchLog.push(stepLog);
                      return {
                        formUrl: actualUrl,
                        searchLog,
                        totalPagesChecked,
                        initialLinksFound,
                      };
                    }
                  }
                }
              }
            }
          }

          const debug = formCheck?.debugInfo as
            | Record<string, unknown>
            | undefined;
          stepLog.hasForm = !!formCheck?.hasForm;
          stepLog.formCount = (debug?.formCount as number) ?? 0;
          stepLog.inputCount = (debug?.inputCount as number) ?? 0;
          stepLog.formScore = (debug?.bestScore as number) ?? undefined;
          stepLog.formReasons = (debug?.bestReasons as string[]) ?? undefined;
          stepLog.hasCaptcha = (debug?.hasCaptcha as boolean) ?? false;
          stepLog.captchaType =
            (debug?.captchaType as string | null) ?? undefined;
          stepLog.captchaIsBlocker =
            (debug?.captchaIsBlocker as boolean) ?? undefined;

          if (formCheck?.hasForm) {
            const pageClass =
              (debug?.pageClassification as string) ?? "allowed";
            searchLog.push(stepLog);

            if (pass === "preferred") {
              console.log(
                `[Background] FormPageDeep: Form found at ${current.url} (pageType=${pageClass}, tier=preferred)`,
              );
              return {
                formUrl: current.url,
                searchLog,
                totalPagesChecked,
                initialLinksFound,
              };
            } else {
              fallbackFormUrl = current.url;
              console.log(
                `[Background] FormPageDeep: Fallback form found at ${current.url} (pageType=${pageClass}), saved`,
              );
              break;
            }
          }

          // さらにリンクを収集（同一ドメインで深さに余裕がある場合）
          const depthLimit =
            current.tier === "preferred"
              ? MAX_DEPTH_SAME_DOMAIN
              : MAX_DEPTH_SAME_DOMAIN - 1;
          if (!current.isExternal && current.depth < depthLimit) {
            const deepLinksResult = await sendMessageToTab(tabId, {
              type: "FIND_CONTACT_LINKS",
            });
            const deepLinks: ContactLink[] =
              (deepLinksResult?.links as ContactLink[] | undefined) ?? [];

            const newLinks: ContactLink[] = [];
            for (const link of deepLinks) {
              if (!visited.has(link.url)) {
                visited.add(link.url);
                newLinks.push(link);
                if (
                  pass === "preferred" &&
                  (link.tier === "preferred" || !link.tier)
                ) {
                  passQueue.push({
                    url: link.url,
                    depth: current.depth + 1,
                    isExternal: link.isExternal,
                    tier: link.tier || "preferred",
                  });
                }
              }
            }
            stepLog.linksFound = newLinks.length;
            if (newLinks.length > 0) {
              stepLog.linkUrls = newLinks.map(
                (l) =>
                  `[${l.tier || "preferred"}] ${l.text ? l.text + ": " : ""}${l.url}${l.isExternal ? " (外部)" : ""}`,
              );
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stepLog.error = msg;
          console.log(
            `[Background] FormPageDeep: Error at ${current.url}: ${msg}`,
          );
        }

        searchLog.push(stepLog);
      }
    }

    if (fallbackFormUrl) {
      console.log(
        `[Background] FormPageDeep: Using fallback form: ${fallbackFormUrl}`,
      );
      return {
        formUrl: fallbackFormUrl,
        searchLog,
        totalPagesChecked,
        initialLinksFound,
      };
    }

    console.log(
      `[Background] FormPageDeep: No form found (${totalPagesChecked} pages checked)`,
    );
    return {
      formUrl: null,
      searchLog,
      totalPagesChecked,
      initialLinksFound,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Background] FormPageDeep: Fatal error:`, msg);
    return {
      formUrl: null,
      searchLog,
      totalPagesChecked,
      initialLinksFound,
    };
  }
}

// 拡張機能インストール時の処理
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[Background] Extension installed:", details.reason);
  if (details.reason === "install") {
    // 初期設定
    await chrome.storage.local.set({
      isProcessing: false,
    });
    console.log("[Background] Initial settings saved");
  }

  // Side Panelの設定（アイコンクリックでSide Panelを開く）
  if (chrome.sidePanel) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    console.log("[Background] Side Panel configured");
  }
});

// Side Panelを開く関数
async function openSidePanel(): Promise<void> {
  try {
    if (!chrome.sidePanel) {
      console.log("[Background] Side Panel API not available");
      return;
    }

    // 現在のウィンドウを取得
    const [currentWindow] = await chrome.windows.getAll({
      windowTypes: ["normal"],
    });
    if (currentWindow?.id) {
      await chrome.sidePanel.open({ windowId: currentWindow.id });
      console.log("[Background] Side Panel opened");
    }
  } catch (error) {
    console.log("[Background] Failed to open Side Panel:", error);
  }
}

// タブが閉じられた時の処理（処理中のアイテムをfailedにする）
chrome.tabs.onRemoved.addListener(async (tabId, _removeInfo) => {
  // 処理中のアイテムがあれば確認
  const processingItem = await queueManager.getProcessingItem();
  if (processingItem) {
    console.log(`[Background] Tab ${tabId} closed while processing item`);
    // ステータスは processNextItem の finally で処理される
  }
});

export {};
