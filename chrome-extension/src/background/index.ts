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
  return result.maxConcurrent || 3;
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

// 送信結果をAPIに報告
async function reportResultToApi(
  leadId: string,
  status: "success" | "failed",
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

            // 処理開始
            console.log(
              `[Background] Starting queue processing for ${addedCount} items`,
            );
            setTimeout(() => processNextItem(), 500);
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
            const newMaxConcurrent = message.maxConcurrent;
            if (
              typeof newMaxConcurrent === "number" &&
              newMaxConcurrent >= 1 &&
              newMaxConcurrent <= 5
            ) {
              await chrome.storage.local.set({
                maxConcurrent: newMaxConcurrent,
              });
              console.log(
                `[Background] Max concurrent set to: ${newMaxConcurrent}`,
              );
              sendResponse({ success: true, maxConcurrent: newMaxConcurrent });
            } else {
              sendResponse({
                success: false,
                error: "Invalid maxConcurrent value",
              });
            }
            break;

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

    // フォーム検索とページ遷移をBackground側で管理（詳細ログ付き）
    const { formUrl, attemptLogs } = await findContactFormPage(
      tab.id,
      nextItem.url,
    );

    // attemptLogsをログ出力（URLごとの試行タイムライン）
    console.log(
      `[Background] Form search completed. Attempts: ${attemptLogs.length}`,
    );
    attemptLogs.forEach((log, idx) => {
      console.log(
        `[Background] Attempt ${idx}: ${log.toUrl} -> ${log.finalResult}`,
        {
          contentScriptReady: log.contentScriptReady,
          debugInfo: log.checkForFormResult?.debugInfo,
        },
      );
    });

    if (!formUrl) {
      // attemptLogsを失敗情報に含める
      const attemptSummary = attemptLogs.map((a) => ({
        url: a.toUrl,
        result: a.finalResult,
        hasForm: a.checkForFormResult?.hasForm,
        formCount: a.checkForFormResult?.debugInfo?.formCount,
        inputCount: a.checkForFormResult?.debugInfo?.inputCount,
      }));
      throw new Error(
        `フォームが見つかりません (${attemptLogs.length}ページ試行: ${JSON.stringify(attemptSummary)})`,
      );
    }

    console.log(
      `[Background] Form found at: ${formUrl}, sending form submission request`,
    );

    // Content Scriptにフォーム入力を依頼（タイムアウト付き）
    const result = await Promise.race([
      sendMessageToTab(tab.id, {
        type: "FILL_AND_SUBMIT_FORM",
        payload: nextItem,
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
          () => resolve({ success: false, error: "処理タイムアウト（2分）" }),
          120000, // 2分のタイムアウト
        ),
      ),
    ]);

    console.log(`[Background] Form submission result:`, result);

    if (result.success) {
      await queueManager.updateItemStatus(nextItem.id, "completed", {
        completedAt: new Date().toISOString(),
        finalUrl: result.finalUrl,
        debugLogs: result.debugLogs?.join("\n"),
      });
      console.log(
        `[Background] ✅ Item completed successfully: ${nextItem.company}`,
      );
      if (result.debugLogs) {
        console.log(
          `[Background] Logs:\n${result.debugLogs.slice(-10).join("\n")}`,
        );
      }
      // APIに成功を報告
      await reportResultToApi(nextItem.leadId, "success");
    } else {
      const debugInfo = result.debugInfo
        ? JSON.stringify(result.debugInfo, null, 2)
        : "";
      await queueManager.updateItemStatus(nextItem.id, "failed", {
        error: result.error || "Unknown error",
        failedAt: new Date().toISOString(),
        debugLogs: result.debugLogs?.join("\n"),
        debugInfo,
      });
      console.log(
        `[Background] ❌ Item failed: ${nextItem.company} - ${result.error}`,
      );
      if (result.debugLogs) {
        console.log(`[Background] Debug logs:\n${result.debugLogs.join("\n")}`);
      }
      if (debugInfo) {
        console.log(`[Background] Debug info: ${debugInfo}`);
      }
      // APIに失敗を報告
      await reportResultToApi(nextItem.leadId, "failed", result.error);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[Background] Processing error for ${nextItem.company}:`,
      errorMessage,
    );

    await queueManager.updateItemStatus(nextItem.id, "failed", {
      error: errorMessage,
      failedAt: new Date().toISOString(),
    });
    // APIにエラーを報告
    await reportResultToApi(nextItem.leadId, "failed", errorMessage);
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

  // 次のアイテムを処理（並行数の上限まで）
  setTimeout(() => startNextProcesses(), 1000);
}

// 並行数の上限まで処理を開始
async function startNextProcesses(): Promise<void> {
  const maxConcurrent = await getMaxConcurrent();
  for (let i = 0; i < maxConcurrent; i++) {
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
}> {
  console.log(
    `[Background] sendMessageToTab: tabId=${tabId}, type=${message.type}`,
  );

  // 1. 明示的にContent Scriptを注入（ページ遷移後の確実な注入）
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["src/content/formHandler.js"],
    });
    console.log(
      `[Background] Content Script injected successfully for tab ${tabId}`,
    );
  } catch (injectError) {
    console.log(
      `[Background] Content Script injection failed (may already be injected):`,
      injectError,
    );
    // 既に注入されている場合はエラーになるが、続行
  }

  // 2. READYハンドシェイク: Content Scriptが準備完了かを確認
  let contentReady = false;
  for (let pingAttempt = 1; pingAttempt <= 3; pingAttempt++) {
    try {
      const pingResult = await chrome.tabs.sendMessage(tabId, {
        type: "PING_CONTENT",
      });
      if (pingResult?.ready) {
        contentReady = true;
        console.log(
          `[Background] Content Script READY confirmed on attempt ${pingAttempt}`,
        );
        break;
      }
    } catch (pingError) {
      console.log(
        `[Background] PING attempt ${pingAttempt}/3 failed:`,
        pingError,
      );
      await sleep(500);
    }
  }

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
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, message);
      console.log(`[Background] Message sent successfully:`, {
        tabId,
        attempt,
        messageType: message.type,
        resultSuccess: result?.success,
      });
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(
        `[Background] Message attempt ${attempt}/${retries} failed:`,
        error,
      );

      // ページ遷移によるエラーの場合、送信成功の可能性がある
      if (
        errorMsg.includes("back/forward cache") ||
        errorMsg.includes("message channel closed") ||
        errorMsg.includes("Receiving end does not exist")
      ) {
        // 現在のページが成功ページかチェック
        try {
          const tab = await chrome.tabs.get(tabId);
          const currentUrl = tab.url || "";
          const successPatterns = [
            "thanks",
            "thank-you",
            "thankyou",
            "complete",
            "success",
            "sent",
            "done",
            "完了",
          ];

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
      }

      if (attempt < retries) {
        await sleep(1000);
      }
    }
  }
  return {
    success: false,
    error: "Content Scriptとの通信に失敗しました",
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

// URLごとの試行ログエントリ
interface AttemptLog {
  attemptIndex: number;
  fromUrl: string;
  toUrl: string;
  timestamp: string;
  tabsUpdateResult: "success" | "error";
  tabsUpdateError?: string;
  waitForTabLoadResult: "success" | "timeout" | "error";
  waitForTabLoadError?: string;
  contentScriptReady: boolean;
  checkForFormResult?: {
    hasForm: boolean;
    debugInfo?: Record<string, unknown>;
  };
  finalResult: "form_found" | "no_form" | "error";
}

// フォームが存在するページを見つける（Background主導 + 詳細タイムラインログ）
async function findContactFormPage(
  tabId: number,
  initialUrl: string,
): Promise<{
  formUrl: string | null;
  attemptLogs: AttemptLog[];
}> {
  const attemptLogs: AttemptLog[] = [];

  console.log(
    `[Background] ===== Starting form page search for ${initialUrl} =====`,
  );

  try {
    // 1. 現在のページでフォームをチェック（attempt 0）
    const initialAttempt: AttemptLog = {
      attemptIndex: 0,
      fromUrl: initialUrl,
      toUrl: initialUrl,
      timestamp: new Date().toISOString(),
      tabsUpdateResult: "success", // 初回は遷移不要
      waitForTabLoadResult: "success",
      contentScriptReady: false,
      finalResult: "no_form",
    };

    console.log(`[Background] Attempt 0: Checking initial page ${initialUrl}`);
    const hasFormOnCurrent = await sendMessageToTab(tabId, {
      type: "CHECK_FOR_FORM",
    });
    initialAttempt.contentScriptReady = true;
    initialAttempt.checkForFormResult = {
      hasForm: hasFormOnCurrent?.hasForm || false,
      debugInfo: hasFormOnCurrent?.debugInfo,
    };

    if (hasFormOnCurrent?.hasForm) {
      initialAttempt.finalResult = "form_found";
      attemptLogs.push(initialAttempt);
      console.log(`[Background] ✅ Attempt 0: Form found on initial page`);
      return { formUrl: initialUrl, attemptLogs };
    }

    attemptLogs.push(initialAttempt);
    console.log(
      `[Background] Attempt 0: No form on initial page`,
      hasFormOnCurrent?.debugInfo,
    );

    // 2. お問い合わせページ候補を取得
    console.log(`[Background] Finding contact page candidates...`);
    const candidatesResult = await sendMessageToTab(tabId, {
      type: "FIND_CONTACT_PAGE",
    });
    const candidates = candidatesResult?.candidates || [];

    console.log(
      `[Background] Found ${candidates.length} candidates:`,
      candidates.slice(0, 5),
    );

    if (candidates.length <= 1) {
      console.log(`[Background] No additional candidates to try`);
      return { formUrl: null, attemptLogs };
    }

    // 3. 各候補ページを試す（最初の候補はスキップ = 現在のページ）- 全候補を検索
    for (let i = 1; i < candidates.length; i++) {
      const candidateUrl = candidates[i];
      const currentUrl = (await chrome.tabs.get(tabId)).url || initialUrl;

      const attempt: AttemptLog = {
        attemptIndex: i,
        fromUrl: currentUrl,
        toUrl: candidateUrl,
        timestamp: new Date().toISOString(),
        tabsUpdateResult: "success",
        waitForTabLoadResult: "success",
        contentScriptReady: false,
        finalResult: "no_form",
      };

      console.log(`[Background] ----- Attempt ${i}: ${candidateUrl} -----`);

      try {
        // 3a. ページ遷移
        console.log(
          `[Background] Attempt ${i}: Navigating with chrome.tabs.update...`,
        );
        await chrome.tabs.update(tabId, { url: candidateUrl });
        attempt.tabsUpdateResult = "success";
        console.log(`[Background] Attempt ${i}: tabs.update succeeded`);

        // 3b. ページ読み込み完了を待つ
        console.log(`[Background] Attempt ${i}: Waiting for tab load...`);
        await waitForTabLoad(tabId);
        attempt.waitForTabLoadResult = "success";
        console.log(`[Background] Attempt ${i}: Tab load complete`);

        // 3c. タブの実際のURLを確認
        const tabAfterLoad = await chrome.tabs.get(tabId);
        console.log(
          `[Background] Attempt ${i}: Tab URL after load: ${tabAfterLoad.url}`,
        );

        // 3d. フォームチェック（sendMessageToTabがContent Script注入 + READY確認を行う）
        console.log(`[Background] Attempt ${i}: Checking for form...`);
        const hasForm = await sendMessageToTab(tabId, {
          type: "CHECK_FOR_FORM",
        });
        attempt.contentScriptReady = true;
        attempt.checkForFormResult = {
          hasForm: hasForm?.hasForm || false,
          debugInfo: hasForm?.debugInfo,
        };

        console.log(`[Background] Attempt ${i}: CHECK_FOR_FORM result:`, {
          hasForm: hasForm?.hasForm,
          debugInfo: hasForm?.debugInfo,
        });

        if (hasForm?.hasForm) {
          attempt.finalResult = "form_found";
          attemptLogs.push(attempt);
          console.log(
            `[Background] ✅ Attempt ${i}: Form found at ${candidateUrl}`,
          );
          return { formUrl: candidateUrl, attemptLogs };
        }

        attemptLogs.push(attempt);
        console.log(`[Background] Attempt ${i}: No form found`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[Background] ❌ Attempt ${i}: Error - ${errorMsg}`);

        // エラーの種類を判別
        if (errorMsg.includes("timeout")) {
          attempt.waitForTabLoadResult = "timeout";
          attempt.waitForTabLoadError = errorMsg;
        } else if (
          errorMsg.includes("Content Script") ||
          errorMsg.includes("応答しません")
        ) {
          attempt.contentScriptReady = false;
        } else {
          attempt.tabsUpdateResult = "error";
          attempt.tabsUpdateError = errorMsg;
        }

        attempt.finalResult = "error";
        attemptLogs.push(attempt);
        // 続行
      }
    }

    console.log(
      `[Background] ===== No form found in any of ${attemptLogs.length} attempts =====`,
    );
    return { formUrl: null, attemptLogs };
  } catch (error) {
    console.error(`[Background] Fatal error in findContactFormPage:`, error);
    return { formUrl: null, attemptLogs };
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
