import express from "express";
import cors from "cors";
import { chromium, Browser, Page, Frame } from "playwright";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase クライアント（Service Role キー使用）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase: ReturnType<typeof createClient> | null = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  console.log("[server] Supabase client initialized");
} else {
  console.warn(
    "[server] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set - batch job features disabled",
  );
}

// CORS設定（Vercelからのリクエストを許可）
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ],
    methods: ["POST", "OPTIONS"],
    credentials: true,
  }),
);

// ペイロードサイズ制限を50MBに拡張（100件バッチ処理対応）
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

// ヘルスチェック
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// キューステータス確認エンドポイント
app.get("/queue-status", (_req, res) => {
  res.json({
    queueLength: sendQueue.length,
    activeBrowsers: currentBrowserCount,
    maxBrowsers: MAX_CONCURRENT_BROWSERS,
    availableSlots: MAX_CONCURRENT_BROWSERS - currentBrowserCount,
    queueItems: sendQueue.map((item) => ({
      companyId: item.companyId,
      itemCount: item.items.length,
      waitingSeconds: Math.floor((Date.now() - item.addedAt.getTime()) / 1000),
    })),
  });
});

// ===== 同時実行制御のための変数 =====
// 10社まで同時処理可能（32GBメモリで余裕あり、各社は内部で直列処理）
const MAX_CONCURRENT_BROWSERS = 10;
let currentBrowserCount = 0; // 現在実行中のブラウザ数

console.log(
  `[server] Starting with MAX_CONCURRENT_BROWSERS=${MAX_CONCURRENT_BROWSERS} (10 companies can process simultaneously)`,
);

// 送信キュー（待機中のリクエストを管理）
interface QueueItem {
  req: express.Request;
  res: express.Response;
  items: Payload[];
  debug: boolean;
  companyId?: string; // 企業識別用（ログ用）
  addedAt: Date;
}

const sendQueue: QueueItem[] = [];
let isProcessingQueue = false;

// 型定義
type Payload = {
  url: string;
  company?: string;
  department?: string;
  title?: string;
  person?: string;
  name?: string;
  lastName?: string; // 姓（漢字）
  firstName?: string; // 名（漢字）
  lastNameKana?: string; // 姓（ふりがな）
  firstNameKana?: string; // 名（ふりがな）
  fullNameKana?: string; // フルネームふりがな（姓名まとめて）
  email?: string;
  emailConfirm?: string; // メール確認用（自動入力）
  phone?: string;
  postalCode?: string; // 郵便番号
  prefecture?: string; // 都道府県
  city?: string; // 市区町村
  address?: string; // 住所（番地以降）
  building?: string; // 建物名
  subject?: string;
  message?: string;
  debug?: boolean;
};

type Result = {
  success: boolean;
  logs: string[];
  finalUrl?: string;
  note?: string;
};

// メインのauto-submitエンドポイント（単一送信）
app.post("/auto-submit", async (req, res) => {
  const payload = req.body as Payload;

  if (!payload.url) {
    return res.status(400).json({
      success: false,
      logs: ["Missing required field: url"],
      note: "URL is required",
    });
  }

  try {
    const result = await autoSubmit(payload);
    // ローカルログ出力
    console.log(`[auto-submit] ${payload.url} - success=${result.success}`);
    if (!result.success) {
      console.log(`[auto-submit] Failure reason: ${result.note || "Unknown"}`);
      console.log(`[auto-submit] Logs:\n${result.logs.join("\n")}`);
    }
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[auto-submit] Error: ${message}`);
    return res.status(500).json({
      success: false,
      logs: [`Server error: ${message}`],
      note: message,
    });
  }
});

// キュー処理関数
async function processQueue() {
  if (isProcessingQueue || sendQueue.length === 0) return;

  // 同時実行数チェック
  if (currentBrowserCount >= MAX_CONCURRENT_BROWSERS) {
    console.log(
      `[queue] Maximum browsers (${MAX_CONCURRENT_BROWSERS}) reached, waiting...`,
    );
    return;
  }

  isProcessingQueue = true;

  try {
    while (
      sendQueue.length > 0 &&
      currentBrowserCount < MAX_CONCURRENT_BROWSERS
    ) {
      const queueItem = sendQueue.shift();
      if (!queueItem) break;

      currentBrowserCount++;
      const waitTime = Math.floor(
        (Date.now() - queueItem.addedAt.getTime()) / 1000,
      );
      console.log(
        `[queue] Processing request (waited ${waitTime}s). Active browsers: ${currentBrowserCount}/${MAX_CONCURRENT_BROWSERS}`,
      );

      // 非同期でバッチ処理を実行（並列処理）
      executeBatch(queueItem).finally(() => {
        currentBrowserCount--;
        console.log(
          `[queue] Request completed. Active browsers: ${currentBrowserCount}/${MAX_CONCURRENT_BROWSERS}`,
        );
        // 次のキューアイテムを処理
        setTimeout(() => processQueue(), 100);
      });
    }
  } finally {
    isProcessingQueue = false;
  }
}

// 実際のバッチ処理実行（Playwright推奨: 1ブラウザ + 各アイテムで新しいコンテキスト）
async function executeBatch(queueItem: QueueItem) {
  const { res, items, debug, companyId } = queueItem;

  // SSE接続が切断されたかチェック
  let connectionClosed = false;
  res.on("close", () => {
    connectionClosed = true;
    console.log(`[executeBatch] Client disconnected for company ${companyId}`);
  });

  let browser: Browser | null = null;

  try {
    console.log(
      `[executeBatch] Starting batch for company ${companyId}: ${items.length} items`,
    );
    res.write(
      `data: ${JSON.stringify({ type: "batch_start", queuePosition: 0 })}\n\n`,
    );

    // バッチ全体で1つのブラウザを起動（Playwright推奨）
    console.log(`[executeBatch] Launching single browser for entire batch`);
    browser = await chromium.launch({
      headless: !debug,
      slowMo: debug ? 200 : 0,
      args: [
        // セキュリティ関連
        "--no-sandbox",
        "--disable-setuid-sandbox",

        // メモリ最適化（重要）
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-gl-drawing-for-tests",
        "--disable-accelerated-2d-canvas",

        // バックグラウンド処理の無効化
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",

        // 不要な機能の無効化
        "--disable-extensions",
        "--disable-plugins",
        "--memory-pressure-off",
      ],
    });
    console.log(`[executeBatch] Browser launched successfully`);
    res.write(`data: ${JSON.stringify({ type: "browser_ready" })}\n\n`);

    // 各アイテムを順次処理（各アイテムで新しいコンテキストを作成）
    for (let i = 0; i < items.length; i++) {
      // SSE接続が切断されていたら処理中断
      if (connectionClosed) {
        console.log(
          `[executeBatch] Connection closed, aborting batch at item ${i + 1}/${items.length}`,
        );
        break;
      }

      const payload = items[i];

      try {
        // 処理開始を通知
        try {
          res.write(
            `data: ${JSON.stringify({
              type: "item_start",
              index: i,
              url: payload.url,
            })}\n\n`,
          );
        } catch (writeError) {
          console.error(
            `[executeBatch] Failed to write item_start, connection may be closed`,
          );
          break;
        }

        console.log(
          `[auto-submit/batch] [${i + 1}/${items.length}] Processing ${payload.url}`,
        );

        // フォーム送信処理（内部で新しいコンテキストを作成・破棄）
        const result = await autoSubmitWithBrowser(browser, payload);

        // 詳細ログ出力
        console.log(
          `[auto-submit/batch] [${i + 1}/${items.length}] ${payload.url} - success=${result.success}`,
        );
        if (!result.success) {
          console.log(
            `[auto-submit/batch] [${i + 1}/${items.length}] Failure reason: ${result.note || "Unknown"}`,
          );
          console.log(
            `[auto-submit/batch] [${i + 1}/${items.length}] Error logs:\n${result.logs.slice(-5).join("\n")}`,
          );
        }

        // 処理完了を通知
        try {
          res.write(
            `data: ${JSON.stringify({
              type: "item_complete",
              index: i,
              url: payload.url,
              success: result.success,
              logs: result.logs,
              finalUrl: result.finalUrl,
              note: result.note,
            })}\n\n`,
          );
        } catch (writeError) {
          console.error(
            `[executeBatch] Failed to write item_complete, connection may be closed`,
          );
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;

        console.error(
          `[auto-submit/batch] [${i + 1}/${items.length}] Error: ${message}`,
        );
        if (stack) {
          console.error(
            `[auto-submit/batch] [${i + 1}/${items.length}] Stack trace: ${stack.split("\n").slice(0, 3).join(" | ")}`,
          );
        }

        // ブラウザクラッシュの場合はバッチ全体を中断
        const isFatalError =
          message.includes("Browser closed") ||
          message.includes("Protocol error");

        try {
          res.write(
            `data: ${JSON.stringify({
              type: "item_error",
              index: i,
              url: payload.url,
              error: message,
              fatal: isFatalError,
            })}\n\n`,
          );
        } catch (writeError) {
          console.error(
            `[executeBatch] Failed to write item_error, connection may be closed`,
          );
          break;
        }

        if (isFatalError) {
          console.error(
            `[executeBatch] Fatal browser error, aborting batch at item ${i + 1}/${items.length}`,
          );
          break;
        }
      }
    }

    // 全完了を通知
    if (!connectionClosed) {
      console.log(
        `[executeBatch] Batch completed for company ${companyId}: ${items.length} items processed`,
      );
      try {
        res.write(
          `data: ${JSON.stringify({ type: "batch_complete", total: items.length })}\n\n`,
        );
      } catch (writeError) {
        console.error(
          `[executeBatch] Failed to write batch_complete, connection already closed`,
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[executeBatch] Fatal error for company ${companyId}: ${message}`,
    );
    if (!connectionClosed) {
      try {
        res.write(
          `data: ${JSON.stringify({ type: "fatal_error", error: message })}\n\n`,
        );
      } catch (writeError) {
        console.error(
          `[executeBatch] Failed to write fatal_error, connection already closed`,
        );
      }
    }
  } finally {
    // バッチ終了時にブラウザを確実にクローズ
    if (browser) {
      await browser.close().catch((err) => {
        console.error(`[executeBatch] Failed to close browser: ${err}`);
      });
      console.log(`[executeBatch] Browser closed successfully`);
    }

    if (!connectionClosed) {
      res.end();
    }
  }
}

// 新しいバッチ送信エンドポイント（キューイング対応）
app.post("/auto-submit/batch", async (req, res) => {
  const { items, debug } = req.body as { items: Payload[]; debug?: boolean };

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: "items array is required",
    });
  }

  // リクエスト元の企業識別（IPアドレスやヘッダーから取得可能）
  const companyId =
    (req.headers["x-company-id"] as string) ||
    req.ip ||
    `company_${Date.now()}`;

  // 現在のキューサイズ確認
  const queueLength = sendQueue.length;
  const estimatedWaitTime = Math.ceil(
    (queueLength * 50) / MAX_CONCURRENT_BROWSERS,
  ); // 大雑把な見積もり

  // キューに追加
  const queueItem: QueueItem = {
    req,
    res,
    items,
    debug: debug || false,
    companyId,
    addedAt: new Date(),
  };

  sendQueue.push(queueItem);
  console.log(
    `[queue] Request from ${companyId} added. Queue size: ${sendQueue.length}, Estimated wait: ${estimatedWaitTime}s`,
  );

  // SSE設定
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // キュー情報を送信
  res.write(
    `data: ${JSON.stringify({
      type: "queued",
      position: queueLength,
      estimatedWaitTime,
      activeBrowsers: currentBrowserCount,
      maxBrowsers: MAX_CONCURRENT_BROWSERS,
    })}\n\n`,
  );

  // キュー処理を開始
  processQueue();
});

// 既存ブラウザを使ったフォーム送信（バッチ用）
async function autoSubmitWithBrowser(
  browser: Browser,
  payload: Payload,
): Promise<Result> {
  const logs: string[] = [];
  const startTime = Date.now();

  function log(line: string) {
    const elapsed = Date.now() - startTime;
    const entry = `[${elapsed}ms] ${line}`;
    logs.push(entry);
  }

  log(`=== autoSubmit START ===`);
  log(`Payload: url=${payload.url}, company=${payload.company}`);

  let context: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  let page: Page | null = null;

  try {
    log(`Creating new context and page`);
    context = await browser.newContext();
    page = await context.newPage();
    log(`Page created successfully`);

    const startUrl = sanitizeUrl(payload.url);
    log(`Navigating to: ${startUrl}`);
    try {
      await page.goto(startUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      log(`Navigation completed, current URL: ${page.url()}`);
    } catch (navError) {
      const msg =
        navError instanceof Error ? navError.message : String(navError);
      log(`Navigation FAILED - ${msg}`);
      return {
        success: false,
        logs,
        finalUrl: page?.url(),
        note: `Navigation failed: ${msg}`,
      };
    }
    await page.waitForLoadState("networkidle").catch(() => {
      log(`networkidle timeout (non-fatal)`);
    });

    // Try to find a contact page link and navigate if needed
    log(`Finding contact page candidates...`);
    let contactUrls: string[] = [];
    try {
      contactUrls = await Promise.race([
        findContactPageCandidates(page, log),
        new Promise<string[]>((_, reject) =>
          setTimeout(
            () => reject(new Error("Candidate search timeout")),
            15000,
          ),
        ),
      ]);
      log(`Found ${contactUrls.length} candidates to try`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`⚠️ Candidate search failed: ${msg}, using fallback paths`);
      const url = new URL(page.url());
      const base = `${url.protocol}//${url.host}`;
      contactUrls = [
        page.url(),
        `${base}/contact`,
        `${base}/inquiry`,
        `${base}/toiawase`,
      ];
    }

    let formFound = false;

    // Try each candidate URL until we find a form
    for (let i = 0; i < contactUrls.length; i++) {
      const contactUrl = contactUrls[i];
      log(`[Candidate ${i + 1}/${contactUrls.length}] Trying: ${contactUrl}`);

      if (contactUrl === page.url()) {
        log(`Already on this page, checking for form`);
      } else {
        try {
          log(`Navigating to: ${contactUrl}`);
          await page.goto(contactUrl, {
            waitUntil: "domcontentloaded",
            timeout: 15000, // 15秒に短縮
          });
          log(`✓ Navigation completed`);
        } catch (contactNavError) {
          const msg =
            contactNavError instanceof Error
              ? contactNavError.message
              : String(contactNavError);
          log(`✗ Navigation FAILED - ${msg}, trying next candidate`);
          continue;
        }

        if (contactUrl.includes("#")) {
          const hash = new URL(contactUrl).hash;
          if (hash) {
            const id = hash.replace("#", "");
            const anchor = page.locator(`#${id}`);
            if ((await anchor.count()) > 0) {
              await anchor.scrollIntoViewIfNeeded().catch(() => {});
            }
          }
        }
      }

      // Try to locate a form and fill
      log(`Checking for form...`);
      try {
        const found = await Promise.race([
          findAndFillFormAnyContext(page, payload, log),
          new Promise<boolean | "blocked">((_, reject) =>
            setTimeout(() => reject(new Error("Form search timeout")), 10000),
          ),
        ]);

        if (found === "blocked") {
          log(`Form is protected by CAPTCHA`);
          return {
            success: false,
            logs,
            finalUrl: page.url(),
            note: "CAPTCHA detected",
          };
        }
        if (found) {
          log(`✅ SUCCESS: Form found and filled on URL: ${page.url()}`);
          formFound = true;
          break;
        }
        log(`No form found, trying next candidate`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`⚠️ Form search failed: ${msg}, trying next candidate`);
        continue;
      }
    }

    if (!formFound) {
      log(`No suitable contact form found on any candidate page`);
      return {
        success: false,
        logs,
        finalUrl: page.url(),
        note: "Form not found",
      };
    }

    // Try submit
    log(`Submitting form`);
    const submitted = await submitFormAnyContext(page, log);
    log(submitted ? `Form submitted successfully` : `Form submission FAILED`);

    const finalUrl = page.url();
    log(`=== autoSubmit END === success=${submitted}, finalUrl=${finalUrl}`);

    return { success: submitted, logs, finalUrl };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    log(`UNEXPECTED ERROR: ${message}`);
    return { success: false, logs, finalUrl: page?.url(), note: message };
  } finally {
    // リソースの確実なクリーンアップ（メモリリーク防止）
    log(`Cleaning up resources (page and context)`);
    if (page) {
      await page.close().catch((err) => {
        log(`Warning: Failed to close page: ${err}`);
      });
    }
    if (context) {
      await context.close().catch((err) => {
        log(`Warning: Failed to close context: ${err}`);
      });
    }
  }
}

// autoSubmit関数
async function autoSubmit(payload: Payload): Promise<Result> {
  const logs: string[] = [];
  const startTime = Date.now();

  function log(line: string) {
    const elapsed = Date.now() - startTime;
    const entry = `[${elapsed}ms] ${line}`;
    logs.push(entry);
  }

  log(`=== autoSubmit START ===`);
  log(
    `Payload: url=${payload.url}, company=${payload.company}, department=${payload.department}, title=${payload.title}, email=${payload.email}`,
  );

  let browser: Browser | null = null;
  let context: Awaited<ReturnType<Browser["newContext"]>> | null = null;
  let page: Page | null = null;

  try {
    log(`Step 1: Launching browser (headless=${!payload.debug})`);
    try {
      browser = await chromium.launch({
        headless: !payload.debug,
        slowMo: payload.debug ? 200 : 0,
        args: [
          // セキュリティ関連
          "--no-sandbox",
          "--disable-setuid-sandbox",

          // メモリ最適化（重要）
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-gl-drawing-for-tests", // 大きな効果
          "--disable-accelerated-2d-canvas",

          // バックグラウンド処理の無効化
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",

          // 不要な機能の無効化
          "--disable-extensions",
          "--disable-plugins",
          "--memory-pressure-off",
        ],
      });
      log(`Step 1: Browser launched successfully`);
    } catch (launchError) {
      const msg =
        launchError instanceof Error
          ? launchError.message
          : String(launchError);
      log(`Step 1: FAILED to launch browser - ${msg}`);
      return { success: false, logs, note: `Browser launch failed: ${msg}` };
    }

    log(`Step 2: Creating browser context and page`);
    context = await browser.newContext();
    page = await context.newPage();
    log(`Step 2: Page created successfully`);

    const startUrl = sanitizeUrl(payload.url);
    log(`Step 3: Navigating to: ${startUrl}`);
    try {
      await page.goto(startUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      log(`Step 3: Navigation completed, current URL: ${page.url()}`);
    } catch (navError) {
      const msg =
        navError instanceof Error ? navError.message : String(navError);
      log(`Step 3: Navigation FAILED - ${msg}`);
      return {
        success: false,
        logs,
        finalUrl: page?.url(),
        note: `Navigation failed: ${msg}`,
      };
    }
    await page.waitForLoadState("networkidle").catch(() => {
      log(`Step 3: networkidle timeout (non-fatal)`);
    });

    // Try to find a contact page link and navigate if needed
    log(`Step 4: Finding contact page link`);
    const contactUrl = await findContactPage(page, log);
    if (contactUrl && contactUrl !== page.url()) {
      log(`Step 4: Found contact page, navigating to: ${contactUrl}`);
      try {
        await page.goto(contactUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        log(`Step 4: Contact page navigation completed`);
      } catch (contactNavError) {
        const msg =
          contactNavError instanceof Error
            ? contactNavError.message
            : String(contactNavError);
        log(`Step 4: Contact page navigation FAILED - ${msg}`);
      }
      // If only hash changed, ensure section is in view
      if (contactUrl.includes("#")) {
        const hash = new URL(contactUrl).hash;
        if (hash) {
          const id = hash.replace("#", "");
          const anchor = page.locator(`#${id}`);
          if ((await anchor.count()) > 0) {
            await anchor.scrollIntoViewIfNeeded().catch(() => {});
          }
        }
      }
    } else {
      log(`Step 4: No separate contact page found, using current page`);
    }

    // Try to locate a form and fill (including iframes)
    log(`Step 5: Finding and filling form`);
    const found = await findAndFillFormAnyContext(page, payload, log);
    if (found === "blocked") {
      log(`Step 5: Form is protected by CAPTCHA`);
      return {
        success: false,
        logs,
        finalUrl: page.url(),
        note: "CAPTCHA detected",
      };
    }
    if (!found) {
      log(`Step 5: No suitable contact form found`);
      return {
        success: false,
        logs,
        finalUrl: page.url(),
        note: "Form not found",
      };
    }
    log(`Step 5: Form found and filled`);

    // Try submit
    log(`Step 6: Submitting form`);
    const submitted = await submitFormAnyContext(page, log);
    log(
      submitted
        ? `Step 6: Form submitted successfully`
        : `Step 6: Form submission FAILED`,
    );

    const finalUrl = page.url();
    log(`=== autoSubmit END === success=${submitted}, finalUrl=${finalUrl}`);
    return { success: submitted, logs, finalUrl };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    const stack = error instanceof Error ? error.stack : undefined;
    log(`UNEXPECTED ERROR: ${message}`);
    if (stack) log(`Stack: ${stack.split("\n").slice(0, 3).join(" | ")}`);
    return { success: false, logs, finalUrl: page?.url(), note: message };
  } finally {
    // リソースの確実なクリーンアップ
    log(`Cleaning up resources`);
    if (page) {
      await page.close().catch((err) => {
        log(`Warning: Failed to close page: ${err}`);
      });
    }
    if (context) {
      await context.close().catch((err) => {
        log(`Warning: Failed to close context: ${err}`);
      });
    }
    if (browser) {
      await browser.close().catch((err) => {
        log(`Warning: Failed to close browser: ${err}`);
      });
    }
  }
}

function sanitizeUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

async function findContactPageCandidates(
  page: Page,
  log: (s: string) => void,
): Promise<string[]> {
  const candidates: string[] = [];
  const seen = new Set<string>();

  // Always start with the current page
  const currentUrl = page.url();
  candidates.push(currentUrl);
  seen.add(currentUrl);

  // 1. Try explicit contact link selectors (with timeout and error handling)
  const selectors = [
    "a:has-text('お問い合わせ')",
    "a:has-text('問い合わせ')",
    "a:has-text('Contact')",
    "a[href*='contact']",
    "a[href*='inquiry']",
  ];

  for (const sel of selectors) {
    try {
      const link = page.locator(sel).first();
      const count = await link.count().catch(() => 0);
      if (count > 0) {
        const href = await link
          .getAttribute("href", { timeout: 1000 })
          .catch(() => null);
        if (href) {
          const resolved = new URL(href, page.url()).toString();
          if (!seen.has(resolved)) {
            log(`Found contact link via selector ${sel}: ${resolved}`);
            candidates.push(resolved);
            seen.add(resolved);
          }
        }
      }
    } catch (err) {
      // Selector failed, continue to next
      log(`Selector ${sel} failed, skipping`);
    }
  }

  // 2. Try on-page anchors (with timeout and error handling)
  const anchorCandidates = ["contact", "toiawase", "inquiry"];
  for (const id of anchorCandidates) {
    try {
      const anchor = page.locator(`#${id}`).first();
      const count = await anchor.count().catch(() => 0);
      if (count > 0) {
        const withHash = new URL(`#${id}`, page.url()).toString();
        if (!seen.has(withHash)) {
          log(`Found on-page anchor: #${id}`);
          candidates.push(withHash);
          seen.add(withHash);
        }
      }
    } catch (err) {
      // Anchor check failed, continue
      log(`Anchor check #${id} failed, skipping`);
    }
  }

  // 3. Heuristic search through links (using locator instead of evaluate)
  // Note: Using locator is recommended by Playwright best practices
  // Check multiple text patterns separately
  const textPatterns = ["contact", "inquiry", "お問い合わせ", "問い合わせ"];
  for (const pattern of textPatterns) {
    try {
      const contactLinks = page.locator("a").filter({ hasText: pattern });
      const linkCount = Math.min(await contactLinks.count().catch(() => 0), 5);

      for (let i = 0; i < linkCount; i++) {
        try {
          const link = contactLinks.nth(i);
          const href = await link
            .getAttribute("href", { timeout: 1000 })
            .catch(() => null);
          if (href) {
            const resolved = new URL(href, page.url()).toString();
            if (!seen.has(resolved)) {
              log(`Heuristic link candidate (${pattern}): ${resolved}`);
              candidates.push(resolved);
              seen.add(resolved);
            }
          }
        } catch (err) {
          // Link extraction failed, continue
        }
      }
    } catch (err) {
      log(`Heuristic link search for "${pattern}" failed, skipping`);
    }
  }

  // 4. Try common path patterns
  const url = new URL(page.url());
  const base = `${url.protocol}//${url.host}`;
  const pathCandidates = [
    "/contact",
    "/contact/",
    "/contact-us",
    "/contactus",
    "/contact/ir/",
    "/contact/other",
    "/contact/others",
    "/inquiry",
    "/inquiry/",
    "/inquiries",
    "/inquiry/office.html",
    "/support",
    "/support/",
    "/customer/support/",
    "/toiawase",
    "/toiawase/",
    "/form",
    "/form/",
    "/form/index.php",
    "/form/index.html",
    "/form/index.cgi",
    "/form/form-recruit",
    "/company/contact",
    "/company/contact/",
    "/info/contact",
    "/about/contact",
    "/about/contact/",
    "/ssl/contact",
    "/ssl/cf_question/index.html",
    "/contact_dp",
    "/contact-ir",
  ];
  for (const path of pathCandidates) {
    try {
      const candidate = new URL(path, base).toString();
      if (!seen.has(candidate)) {
        candidates.push(candidate);
        seen.add(candidate);
      }
    } catch (err) {
      // Invalid URL, skip
    }
  }

  // 候補数を制限（処理時間管理のため）
  const maxCandidates = 20;
  const limitedCandidates = candidates.slice(0, maxCandidates);

  log(
    `📋 Found ${candidates.length} contact page candidates, trying first ${limitedCandidates.length}:`,
  );
  limitedCandidates.forEach((url, i) => {
    log(`  [${i + 1}] ${url}`);
  });
  return limitedCandidates;
}

async function findContactPage(
  page: Page,
  log: (s: string) => void,
): Promise<string | null> {
  const selectors = [
    "a:has-text('お問い合わせ')",
    "a:has-text('問い合わせ')",
    "a:has-text('お問い合わせはこちら')",
    "a:has-text('Contact')",
    "a:has-text('CONTACT')",
    "a[href^='#contact']",
    "a[href*='#contact']",
    "a[href*='contact']",
    "a[href*='toiawase']",
    "a[href*='inquiry']",
    "a[href*='support']",
  ];

  for (const sel of selectors) {
    const link = await page.locator(sel).first();
    if (await link.count()) {
      const href = await link.getAttribute("href");
      if (href) {
        const resolved = new URL(href, page.url()).toString();
        log(`Found contact link via selector ${sel}: ${resolved}`);
        return resolved;
      }
    }
  }

  const anchorCandidates = [
    "contact",
    "toiawase",
    "inquiry",
    "お問い合わせ",
    "問い合わせ",
    "support",
  ];
  for (const id of anchorCandidates) {
    const anchor = page.locator(`#${id}`).first();
    if ((await anchor.count()) > 0) {
      const withHash = new URL(`#${id}`, page.url()).toString();
      await anchor.scrollIntoViewIfNeeded().catch(() => {});
      log(`Found on-page anchor: #${id}`);
      return withHash;
    }
  }

  const candidates = await page.evaluate(() => {
    const as = Array.from(document.querySelectorAll("a"));
    return as
      .map((a) => ({
        href: (a.getAttribute("href") || "").trim(),
        text: (a.textContent || "").trim(),
      }))
      .slice(0, 500);
  });
  const keywordParts = [
    "contact",
    "contact-us",
    "contactus",
    "inquiry",
    "toiawase",
    "support",
    "help",
    "feedback",
    "お問い合わせ",
    "問い合わせ",
  ];
  for (const c of candidates) {
    const hay = `${c.href} ${c.text}`.toLowerCase();
    if (keywordParts.some((k) => hay.includes(k))) {
      if (c.href) {
        const resolved = new URL(c.href, page.url()).toString();
        log(`Heuristic link candidate: ${resolved}`);
        return resolved;
      }
    }
  }

  const url = new URL(page.url());
  const base = `${url.protocol}//${url.host}`;
  const pathCandidates = [
    "/contact",
    "/contact/",
    "/contact-us",
    "/contactus",
    "/contact/ir/",
    "/contact/other",
    "/contact/others",
    "/inquiry",
    "/inquiry/",
    "/inquiries",
    "/inquiry/office.html",
    "/support",
    "/support/",
    "/customer/support/",
    "/toiawase",
    "/toiawase/",
    "/form",
    "/form/",
    "/form/index.php",
    "/form/index.html",
    "/form/index.cgi",
    "/company/contact",
    "/company/contact/",
    "/info/contact",
    "/about/contact",
    "/about/contact/",
    "/ssl/contact",
    "/ssl/cf_question/index.html",
    "/contact_dp",
    "/contact-ir",
  ];
  for (const path of pathCandidates) {
    const candidate = new URL(path, base).toString();
    log(`Path candidate: ${candidate}`);
    return candidate;
  }

  log("No explicit contact link/anchor found; staying on current page");
  return null;
}

async function findAndFillForm(
  page: Page | Frame,
  payload: Payload,
  log: (s: string) => void,
): Promise<boolean | "blocked"> {
  const formLocators = [
    "form[action*='contact']",
    "form[action*='inquiry']",
    "form[action*='toiawase']",
    "form:has(input[type='email'])",
    "form:has(input[name*='email'])",
    "form:has(input), form:has(textarea)",
  ];

  let formFound = null as null | ReturnType<Page["locator"]>;

  // 最初の試行
  for (const fs of formLocators) {
    const loc = page.locator(fs).first();
    if ((await loc.count()) > 0) {
      formFound = loc;
      log(`Found form by selector: ${fs}`);
      break;
    }
  }
  if (!formFound) {
    const anyForm = page.locator("form").first();
    if ((await anyForm.count()) > 0) {
      formFound = anyForm;
      log("Fallback: using first form on the page");
    }
  }

  // フォームが見つからない場合、動的レンダリングを待機してリトライ
  if (!formFound) {
    log("Form not found on initial check, waiting for dynamic rendering...");
    await page.waitForTimeout(3000);

    for (const fs of formLocators) {
      const loc = page.locator(fs).first();
      if ((await loc.count()) > 0) {
        formFound = loc;
        log(`Found form after waiting: ${fs}`);
        break;
      }
    }
    if (!formFound) {
      const anyForm = page.locator("form").first();
      if ((await anyForm.count()) > 0) {
        formFound = anyForm;
        log("Fallback after waiting: using first form on the page");
      }
    }

    // <form>タグがない場合、email入力欄を含むコンテナを探す
    if (!formFound) {
      const emailInputContainerSelectors = [
        "div:has(input[type='email'])",
        "section:has(input[type='email'])",
        "div:has(input[name*='email' i])",
      ];
      for (const containerSel of emailInputContainerSelectors) {
        const container = page.locator(containerSel).first();
        if ((await container.count()) > 0) {
          formFound = container;
          log(`Found formless container with email input: ${containerSel}`);
          break;
        }
      }
    }
  }

  if (!formFound) {
    log(`❌ No form found on this page`);
    return false;
  }

  log(`✓ Form found, checking for CAPTCHA...`);

  // reCAPTCHA / hCaptcha 検出
  const captchaSelectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    ".g-recaptcha",
    'div[class*="recaptcha"]',
    "div[data-sitekey]",
    ".h-captcha",
    'div[class*="hcaptcha"]',
  ];
  for (const sel of captchaSelectors) {
    const captcha = page.locator(sel).first();
    if ((await captcha.count()) > 0) {
      log(`❌ CAPTCHA detected: ${sel}`);
      return "blocked"; // CAPTCHA検出時は "blocked" を返す
    }
  }

  const fieldStrategies: Array<{
    value: string | undefined;
    selectors: string[];
  }> = [
    {
      value: payload.company,
      selectors: [
        "input[name*='company']",
        "input[id*='company']",
        "input[name*='corp']",
        "input[id*='corp']",
        "input[placeholder*='会社']",
        "input[placeholder*='企業']",
        "input[placeholder*='御社']",
      ],
    },
    {
      value: payload.department,
      selectors: [
        "input[name*='department']",
        "input[id*='department']",
        "input[name*='division']",
        "input[id*='division']",
        "input[name*='busho']",
        "input[id*='busho']",
        "input[placeholder*='部署']",
        "input[placeholder*='所属']",
      ],
    },
    {
      value: payload.title,
      selectors: [
        "input[name*='position']",
        "input[id*='position']",
        "input[name*='post']",
        "input[id*='post']",
        "input[name*='yakushoku']",
        "input[id*='yakushoku']",
        "input[name*='title']",
        "input[id*='title']",
        "input[placeholder*='役職']",
        "input[placeholder*='肩書']",
      ],
    },
    {
      value: payload.person,
      selectors: [
        "input[name*='person']",
        "input[id*='person']",
        "input[name*='tantou']",
        "input[id*='tantou']",
        "input[placeholder*='担当']",
        "input[placeholder*='担当者']",
      ],
    },
    {
      value: payload.name,
      selectors: [
        "input[name*='name']",
        "input[id*='name']",
        "input[placeholder*='名前']",
        "input[placeholder*='氏名']",
        "input[placeholder*='お名前']",
      ],
    },
    {
      value: payload.lastName,
      selectors: [
        "input[name*='last_name']",
        "input[name*='lastname']",
        "input[name*='sei']",
        "input[id*='last_name']",
        "input[id*='lastname']",
        "input[id*='sei']",
        "input[placeholder*='姓']",
        "input[placeholder*='苗字']",
      ],
    },
    {
      value: payload.firstName,
      selectors: [
        "input[name*='first_name']",
        "input[name*='firstname']",
        "input[name*='mei']",
        "input[id*='first_name']",
        "input[id*='firstname']",
        "input[id*='mei']",
        "input[placeholder*='名']",
      ],
    },
    {
      value: payload.fullNameKana,
      selectors: [
        "input[name='Name_hurigana']",
        "input[name*='name_hurigana']",
        "input[name*='name_kana']",
        "input[name*='namae_kana']",
        "input[id*='name_hurigana']",
        "input[id*='name_kana']",
        "input[placeholder*='みょうじ なまえ']",
        "input[placeholder*='ふりがな']",
        "input[placeholder*='フリガナ']",
        "input[placeholder*='カナ']",
        "input[placeholder*='かな']",
        "input[placeholder*='カタカナ']",
        "input[placeholder*='よみがな']",
        "input[placeholder*='ヨミガナ']",
      ],
    },
    {
      value: payload.lastNameKana,
      selectors: [
        "input[name*='last_name_kana']",
        "input[name*='lastname_kana']",
        "input[name*='sei_kana']",
        "input[name*='myouji_kana']",
        "input[id*='last_name_kana']",
        "input[id*='lastname_kana']",
        "input[id*='sei_kana']",
        "input[placeholder*='せい']",
        "input[placeholder*='セイ']",
        "input[placeholder*='姓（ふりがな）']",
        "input[placeholder*='姓（カナ）']",
        "input[placeholder*='姓(ふりがな)']",
        "input[placeholder*='姓(カナ)']",
        "input[placeholder*='姓（フリガナ）']",
        "input[placeholder*='姓(フリガナ)']",
        "input[placeholder*='姓（カタカナ）']",
        "input[placeholder*='姓(カタカナ)']",
      ],
    },
    {
      value: payload.firstNameKana,
      selectors: [
        "input[name*='first_name_kana']",
        "input[name*='firstname_kana']",
        "input[name*='mei_kana']",
        "input[id*='namae_kana']",
        "input[id*='first_name_kana']",
        "input[id*='firstname_kana']",
        "input[id*='mei_kana']",
        "input[placeholder*='めい']",
        "input[placeholder*='メイ']",
        "input[placeholder*='名（ふりがな）']",
        "input[placeholder*='名（カナ）']",
        "input[placeholder*='名(ふりがな)']",
        "input[placeholder*='名(カナ)']",
        "input[placeholder*='名（フリガナ）']",
        "input[placeholder*='名(フリガナ)']",
        "input[placeholder*='名（カタカナ）']",
        "input[placeholder*='名(カタカナ)']",
      ],
    },
    {
      value: payload.email,
      selectors: [
        "input[type='email']",
        "input[name*='mail']",
        "input[name*='email']",
        "input[id*='mail']",
        "input[placeholder*='メール']",
      ],
    },
    {
      value: payload.email, // メール確認用も同じ値を入力
      selectors: [
        "input[name='Email_check']",
        "input[name*='email_check']",
        "input[name*='email_confirm']",
        "input[name*='email_confirmation']",
        "input[name*='mail_confirm']",
        "input[name*='mail_confirmation']",
        "input[name*='mail_check']",
        "input[id*='email_check']",
        "input[id*='email_confirm']",
        "input[id*='email_confirmation']",
        "input[id*='mail_confirm']",
        "input[placeholder*='メール確認']",
        "input[placeholder*='メールアドレス（確認）']",
        "input[placeholder*='メールアドレス確認用']",
      ],
    },
    {
      value: payload.phone,
      selectors: [
        "input[type='tel']",
        "input[name*='tel']",
        "input[name*='phone']",
        "input[id*='tel']",
        "input[placeholder*='電話']",
      ],
    },
    {
      value: payload.subject,
      selectors: [
        "input[name*='subject']",
        "input[id*='subject']",
        "input[placeholder*='件名']",
      ],
    },
    {
      value: payload.postalCode,
      selectors: [
        "input[name*='zip']",
        "input[name*='postal']",
        "input[name*='postcode']",
        "input[name*='post_code']",
        "input[id*='zip']",
        "input[id*='postal']",
        "input[placeholder*='郵便番号']",
        "input[placeholder*='〒']",
      ],
    },
    {
      value: payload.prefecture,
      selectors: [
        "input[name*='pref']",
        "input[name*='todofuken']",
        "input[id*='pref']",
        "input[id*='todofuken']",
        "input[placeholder*='都道府県']",
      ],
    },
    {
      value: payload.city,
      selectors: [
        "input[name*='city']",
        "input[name*='shiku']",
        "input[id*='city']",
        "input[id*='shiku']",
        "input[placeholder*='市区町村']",
      ],
    },
    {
      value: payload.address,
      selectors: [
        "input[name*='address']",
        "input[name*='street']",
        "input[name*='town']",
        "input[name*='banchi']",
        "input[id*='address']",
        "input[id*='street']",
        "input[placeholder*='住所']",
        "input[placeholder*='番地']",
      ],
    },
    {
      value: payload.building || "",
      selectors: [
        "input[name*='building']",
        "input[name*='tatemono']",
        "input[id*='building']",
        "input[placeholder*='建物']",
        "input[placeholder*='ビル']",
      ],
    },
  ];

  for (const { value, selectors } of fieldStrategies) {
    if (!value) continue;
    const found = await locateFirst(page, formFound, selectors);
    if (found) {
      await found.fill(value);
      log(`Filled field via ${selectors[0]}`);
    }
  }

  await fillByLabel(
    page,
    formFound,
    [
      {
        keywords: [
          "会社名",
          "御社名",
          "企業名",
          "貴社名",
          "Company",
          "Organization",
          "Corporate",
        ],
        value: payload.company,
      },
      {
        keywords: [
          "部署",
          "部署名",
          "所属",
          "所属部署",
          "営業部",
          "Department",
          "Division",
        ],
        value: payload.department,
      },
      {
        keywords: [
          "役職",
          "肩書",
          "肩書き",
          "一般社員",
          "Position",
          "Title",
          "Job Title",
          "Post",
        ],
        value: payload.title,
      },
      {
        keywords: [
          "担当者",
          "ご担当者",
          "担当者名",
          "Person",
          "Contact person",
          "Your name",
        ],
        value: payload.person || payload.name,
      },
      { keywords: ["氏名", "お名前", "Name"], value: payload.name },
      {
        keywords: ["姓", "苗字", "Last Name", "Family Name"],
        value: payload.lastName,
      },
      {
        keywords: ["名", "First Name", "Given Name"],
        value: payload.firstName,
      },
      {
        keywords: [
          "ふりがな",
          "フリガナ",
          "カナ",
          "かな",
          "カタカナ",
          "よみがな",
          "ヨミガナ",
          "氏名（カタカナ）",
          "氏名(カタカナ)",
          "氏名（カナ）",
          "氏名(カナ)",
          "氏名（ふりがな）",
          "氏名(ふりがな)",
          "お名前（カナ）",
          "お名前(カナ)",
          "Furigana",
          "Kana",
        ],
        value: payload.fullNameKana,
      },
      {
        keywords: [
          "姓（ふりがな）",
          "姓（カナ）",
          "姓（フリガナ）",
          "姓（カタカナ）",
          "姓(ふりがな)",
          "姓(カナ)",
          "せい",
          "セイ",
          "みょうじ",
          "ミョウジ",
        ],
        value: payload.lastNameKana,
      },
      {
        keywords: [
          "名（ふりがな）",
          "名（カナ）",
          "名（フリガナ）",
          "名（カタカナ）",
          "名(ふりがな)",
          "名(カナ)",
          "めい",
          "メイ",
          "なまえ",
          "ナマエ",
        ],
        value: payload.firstNameKana,
      },
      { keywords: ["メール", "E-mail", "Email"], value: payload.email },
      {
        keywords: [
          "メール確認",
          "メールアドレス（確認）",
          "メールチェック",
          "Email Confirmation",
          "Email Check",
        ],
        value: payload.email,
      },
      { keywords: ["電話", "Tel", "Phone"], value: payload.phone },
      { keywords: ["件名", "Subject", "題名"], value: payload.subject },
      {
        keywords: ["本文", "お問い合わせ内容", "Message", "内容"],
        value: payload.message,
      },
      {
        keywords: ["郵便番号", "〒", "Postal", "Zip", "Zipcode"],
        value: payload.postalCode,
      },
      {
        keywords: ["都道府県", "Prefecture"],
        value: payload.prefecture,
      },
      {
        keywords: ["市区町村", "市町村", "City"],
        value: payload.city,
      },
      {
        keywords: ["住所", "番地", "Address", "Street"],
        value: payload.address,
      },
      {
        keywords: ["建物", "ビル", "Building"],
        value: payload.building || "",
      },
    ],
    log,
  );

  if (payload.message) {
    const messageSelectors = [
      "textarea[name*='message']",
      "textarea[id*='message']",
      "textarea[placeholder*='お問い合わせ']",
      "textarea",
    ];
    const found = await locateFirst(page, formFound, messageSelectors);
    if (found) {
      await found.fill(payload.message);
      log("Filled message textarea");
    }
  }

  // セレクトボックス：最初の有効なオプションを選択
  const selects = formFound.locator("select");
  const selectCount = await selects.count();
  for (let i = 0; i < selectCount; i++) {
    const select = selects.nth(i);
    try {
      const options = select.locator("option");
      const optionCount = await options.count();

      for (let j = 0; j < optionCount; j++) {
        const option = options.nth(j);
        const value = (await option.getAttribute("value")) || "";
        const text = (await option.textContent()) || "";
        // 空の値や「選択してください」系をスキップ
        if (
          value !== "" &&
          !text.includes("選択") &&
          !text.includes("---") &&
          !text.includes("未選択")
        ) {
          await select.selectOption({ index: j });
          log(`Selected option index ${j} in select[${i}]`);
          break;
        }
      }
    } catch {
      // 選択できない場合はスキップ
    }
  }

  // チェックボックス：全てチェック（タイムアウト3秒）
  const checkboxes = formFound.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  for (let i = 0; i < checkboxCount; i++) {
    const checkbox = checkboxes.nth(i);
    try {
      const isChecked = await checkbox.isChecked({ timeout: 3000 });
      if (!isChecked) {
        await checkbox.check({ timeout: 3000 });

        // ログ用にラベル情報を取得
        const checkboxId = (await checkbox.getAttribute("id")) || "";
        const checkboxName = (await checkbox.getAttribute("name")) || "";
        let labelText = "";
        if (checkboxId) {
          const label = formFound.locator(`label[for="${checkboxId}"]`).first();
          if ((await label.count()) > 0) {
            labelText = (await label.textContent()) || "";
          }
        }
        if (!labelText) {
          const parentLabel = checkbox.locator("xpath=ancestor::label").first();
          if ((await parentLabel.count()) > 0) {
            labelText = (await parentLabel.textContent()) || "";
          }
        }

        log(
          `Checked checkbox[${i}]: ${labelText.trim() || checkboxName || "unlabeled"}`,
        );
      }
    } catch {
      // チェックできない場合はスキップ
    }
  }

  // ラジオボタン：各グループの最初のものを選択（タイムアウト3秒）
  const radioGroups = new Set<string>();
  const radios = formFound.locator('input[type="radio"]');
  const radioCount = await radios.count();
  for (let i = 0; i < radioCount; i++) {
    const radio = radios.nth(i);
    try {
      const name = await radio.getAttribute("name", { timeout: 3000 });
      if (name && !radioGroups.has(name)) {
        const isChecked = await radio.isChecked({ timeout: 3000 });
        if (!isChecked) {
          await radio.check({ timeout: 3000 });
          log(`Selected radio[${i}] (group: ${name})`);
        }
        radioGroups.add(name);
      }
    } catch {
      // 選択できない場合はスキップ
    }
  }

  // 必須フィールドの最終チェック：未入力の必須フィールドにプレースホルダーベースで値を入力
  // required属性だけでなく、aria-required="true"も検出
  const requiredInputs = formFound.locator(
    'input[required]:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"]), input[aria-required="true"]:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"])',
  );
  const requiredInputCount = await requiredInputs.count();
  for (let i = 0; i < requiredInputCount; i++) {
    const input = requiredInputs.nth(i);
    try {
      const currentValue = await input.inputValue({ timeout: 2000 });
      if (!currentValue || currentValue.trim() === "") {
        const inputName = (await input.getAttribute("name")) || "";
        const inputId = (await input.getAttribute("id")) || "";
        const inputType = (await input.getAttribute("type")) || "text";
        const placeholder = (await input.getAttribute("placeholder")) || "";
        const ariaLabel = (await input.getAttribute("aria-label")) || "";
        const title = (await input.getAttribute("title")) || "";

        // label要素のテキストも取得
        let labelText = "";
        if (inputId) {
          const label = formFound.locator(`label[for="${inputId}"]`).first();
          if ((await label.count()) > 0) {
            labelText = (await label.textContent()) || "";
          }
        }

        const fieldHint =
          `${inputName}${inputId}${placeholder}${ariaLabel}${title}${labelText}`.toLowerCase();

        let defaultValue = "";
        // メールアドレス
        if (
          inputType === "email" ||
          fieldHint.includes("mail") ||
          fieldHint.includes("メール")
        ) {
          defaultValue = payload.email || "test@example.com";
          // 電話番号
        } else if (
          inputType === "tel" ||
          fieldHint.includes("tel") ||
          fieldHint.includes("phone") ||
          fieldHint.includes("電話")
        ) {
          defaultValue = payload.phone || "03-1234-5678";
          // 姓（漢字）
        } else if (
          fieldHint.includes("last_name") ||
          fieldHint.includes("lastname") ||
          fieldHint.includes("sei") ||
          (fieldHint.includes("姓") &&
            !fieldHint.includes("ふりがな") &&
            !fieldHint.includes("カナ"))
        ) {
          defaultValue = payload.lastName || "山田";
          // 名（漢字）
        } else if (
          fieldHint.includes("first_name") ||
          fieldHint.includes("firstname") ||
          fieldHint.includes("mei") ||
          (fieldHint.includes("名") &&
            !fieldHint.includes("姓") &&
            !fieldHint.includes("会社") &&
            !fieldHint.includes("氏") &&
            !fieldHint.includes("ふりがな") &&
            !fieldHint.includes("カナ"))
        ) {
          defaultValue = payload.firstName || "太郎";
          // 姓（ふりがな）
        } else if (
          (fieldHint.includes("姓") &&
            (fieldHint.includes("ふりがな") || fieldHint.includes("カナ"))) ||
          fieldHint.includes("せい") ||
          fieldHint.includes("みょうじ")
        ) {
          defaultValue = payload.lastNameKana || "やまだ";
          // 名（ふりがな）
        } else if (
          (fieldHint.includes("名") &&
            (fieldHint.includes("ふりがな") || fieldHint.includes("カナ"))) ||
          fieldHint.includes("めい") ||
          fieldHint.includes("なまえ")
        ) {
          defaultValue = payload.firstNameKana || "たろう";
          // フルネーム（ふりがな）
        } else if (
          fieldHint.includes("kana") ||
          fieldHint.includes("フリガナ") ||
          fieldHint.includes("ふりがな") ||
          fieldHint.includes("hurigana") ||
          fieldHint.includes("よみがな") ||
          fieldHint.includes("カナ") ||
          fieldHint.includes("かな") ||
          fieldHint.includes("カタカナ") ||
          fieldHint.includes("ヨミガナ")
        ) {
          defaultValue = payload.fullNameKana || "やまだ たろう";
          // 氏名・名前
        } else if (
          fieldHint.includes("name") ||
          fieldHint.includes("氏名") ||
          fieldHint.includes("名前") ||
          fieldHint.includes("お名前")
        ) {
          defaultValue = payload.name || "山田 太郎";
          // 会社名
        } else if (
          fieldHint.includes("company") ||
          fieldHint.includes("corp") ||
          fieldHint.includes("会社") ||
          fieldHint.includes("企業") ||
          fieldHint.includes("御社") ||
          fieldHint.includes("貴社")
        ) {
          defaultValue = payload.company || "テスト株式会社";
          // 部署
        } else if (
          fieldHint.includes("department") ||
          fieldHint.includes("division") ||
          fieldHint.includes("busho") ||
          fieldHint.includes("部署") ||
          fieldHint.includes("所属")
        ) {
          defaultValue = payload.department || "営業部";
          // 役職
        } else if (
          fieldHint.includes("position") ||
          fieldHint.includes("post") ||
          fieldHint.includes("title") ||
          fieldHint.includes("役職") ||
          fieldHint.includes("肩書")
        ) {
          defaultValue = payload.title || "";
          // 郵便番号
        } else if (
          fieldHint.includes("zip") ||
          fieldHint.includes("postal") ||
          fieldHint.includes("郵便") ||
          fieldHint.includes("〒")
        ) {
          defaultValue = payload.postalCode || "";
          // 都道府県
        } else if (
          fieldHint.includes("pref") ||
          fieldHint.includes("都道府県") ||
          fieldHint.includes("todofuken")
        ) {
          defaultValue = payload.prefecture || "";
          // 市区町村
        } else if (
          fieldHint.includes("city") ||
          fieldHint.includes("市区町村") ||
          fieldHint.includes("shiku")
        ) {
          defaultValue = payload.city || "";
          // 住所
        } else if (
          fieldHint.includes("address") ||
          fieldHint.includes("street") ||
          fieldHint.includes("住所") ||
          fieldHint.includes("番地")
        ) {
          defaultValue = payload.address || "";
          // 建物名
        } else if (
          fieldHint.includes("building") ||
          fieldHint.includes("建物") ||
          fieldHint.includes("ビル") ||
          fieldHint.includes("マンション")
        ) {
          defaultValue = payload.building || "";
          // URL
        } else if (
          fieldHint.includes("url") ||
          fieldHint.includes("website") ||
          fieldHint.includes("homepage") ||
          fieldHint.includes("ホームページ")
        ) {
          defaultValue = "https://example.com";
          // その他
        } else {
          defaultValue = "テスト";
        }

        if (defaultValue) {
          await input.fill(defaultValue, { timeout: 2000 });
          log(
            `Filled required field [${inputName || inputId || placeholder}] with: ${defaultValue}`,
          );
        }
      }
    } catch {
      // 入力できない場合はスキップ
    }
  }

  // 必須テキストエリアのチェック（required属性とaria-required="true"の両方）
  const requiredTextareas = formFound.locator(
    'textarea[required], textarea[aria-required="true"]',
  );
  const requiredTextareaCount = await requiredTextareas.count();
  for (let i = 0; i < requiredTextareaCount; i++) {
    const textarea = requiredTextareas.nth(i);
    try {
      const currentValue = await textarea.inputValue({ timeout: 2000 });
      if (!currentValue || currentValue.trim() === "") {
        await textarea.fill(
          payload.message ||
            "お問い合わせありがとうございます。詳細についてご連絡ください。",
          { timeout: 2000 },
        );
        log(`Filled required textarea with default message`);
      }
    } catch {
      // 入力できない場合はスキップ
    }
  }

  // 必須マーク（*、必須など）が付いているフィールドも検出して入力
  const allInputsForRequiredCheck = formFound.locator(
    'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
  );
  const allInputsForRequiredCheckCount =
    await allInputsForRequiredCheck.count();
  for (let i = 0; i < allInputsForRequiredCheckCount; i++) {
    const input = allInputsForRequiredCheck.nth(i);
    try {
      const currentValue = await input.inputValue({ timeout: 1000 });
      if (currentValue && currentValue.trim() !== "") continue;

      const inputId = (await input.getAttribute("id")) || "";
      let labelText = "";
      if (inputId) {
        const label = formFound.locator(`label[for="${inputId}"]`).first();
        if ((await label.count()) > 0) {
          labelText = (await label.textContent()) || "";
        }
      }

      // ラベルに「*」「必須」「※」などが含まれている場合は必須と判定
      const isLikelyRequired =
        labelText.includes("*") ||
        labelText.includes("必須") ||
        labelText.includes("※") ||
        labelText.includes("required");

      if (!isLikelyRequired) continue;

      // 必須と判定されたフィールドにデフォルト値を入力
      const inputName = (await input.getAttribute("name")) || "";
      const inputType = (await input.getAttribute("type")) || "text";
      const placeholder = (await input.getAttribute("placeholder")) || "";
      const ariaLabel = (await input.getAttribute("aria-label")) || "";
      const title = (await input.getAttribute("title")) || "";
      const fieldHint =
        `${inputName}${inputId}${placeholder}${ariaLabel}${title}${labelText}`.toLowerCase();

      let defaultValue = "";
      if (
        inputType === "email" ||
        fieldHint.includes("mail") ||
        fieldHint.includes("メール")
      ) {
        defaultValue = payload.email || "test@example.com";
      } else if (
        inputType === "tel" ||
        fieldHint.includes("tel") ||
        fieldHint.includes("phone") ||
        fieldHint.includes("電話")
      ) {
        defaultValue = payload.phone || "03-1234-5678";
      } else if (
        fieldHint.includes("company") ||
        fieldHint.includes("会社") ||
        fieldHint.includes("企業")
      ) {
        defaultValue = payload.company || "テスト株式会社";
      } else if (
        fieldHint.includes("name") ||
        fieldHint.includes("氏名") ||
        fieldHint.includes("名前")
      ) {
        defaultValue = payload.name || "山田 太郎";
      } else if (
        fieldHint.includes("姓") &&
        !fieldHint.includes("ふりがな") &&
        !fieldHint.includes("カナ")
      ) {
        defaultValue = payload.lastName || "山田";
      } else if (
        fieldHint.includes("名") &&
        !fieldHint.includes("姓") &&
        !fieldHint.includes("氏") &&
        !fieldHint.includes("ふりがな") &&
        !fieldHint.includes("カナ")
      ) {
        defaultValue = payload.firstName || "太郎";
      } else if (
        fieldHint.includes("kana") ||
        fieldHint.includes("ふりがな") ||
        fieldHint.includes("フリガナ")
      ) {
        defaultValue = payload.fullNameKana || "やまだ たろう";
      } else if (
        fieldHint.includes("subject") ||
        fieldHint.includes("件名") ||
        fieldHint.includes("タイトル")
      ) {
        defaultValue = "お問い合わせ";
      } else {
        defaultValue = "テスト";
      }

      if (defaultValue) {
        await input.fill(defaultValue, { timeout: 1000 });
        log(
          `Filled required-marked field [${labelText.trim() || inputName || inputId}] with: ${defaultValue}`,
        );
      }
    } catch {
      // 入力できない場合はスキップ
    }
  }

  // 空のフィールドに対してプレースホルダー/aria-label/titleベースで追加入力（required属性がなくても）
  const allInputs = formFound.locator(
    'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
  );
  const allInputCount = await allInputs.count();
  for (let i = 0; i < allInputCount; i++) {
    const input = allInputs.nth(i);
    try {
      const currentValue = await input.inputValue({ timeout: 1000 });
      if (currentValue && currentValue.trim() !== "") continue; // 既に入力済みならスキップ

      // placeholder, aria-label, title の順で取得
      const placeholder = (await input.getAttribute("placeholder")) || "";
      const ariaLabel = (await input.getAttribute("aria-label")) || "";
      const title = (await input.getAttribute("title")) || "";
      const hint = placeholder || ariaLabel || title;

      // ヒントがない場合でも、必須フィールドなら「テスト」を入力
      if (!hint) {
        const isRequired =
          (await input.getAttribute("required")) !== null ||
          (await input.getAttribute("aria-required")) === "true";
        if (isRequired) {
          await input.fill("テスト", { timeout: 1000 });
          log(`Filled required field without hint with: テスト`);
        }
        continue;
      }

      const hintLower = hint.toLowerCase();
      let valueToFill = "";

      // placeholder/aria-label/titleに基づいて値を決定
      if (
        hintLower.includes("メール") ||
        hintLower.includes("mail") ||
        hintLower.includes("email")
      ) {
        valueToFill = payload.email || "";
      } else if (
        hintLower.includes("電話") ||
        hintLower.includes("tel") ||
        hintLower.includes("phone")
      ) {
        valueToFill = payload.phone || "";
      } else if (
        hintLower.includes("会社") ||
        hintLower.includes("企業") ||
        hintLower.includes("御社") ||
        hintLower.includes("貴社") ||
        hintLower.includes("company")
      ) {
        valueToFill = payload.company || "";
      } else if (
        hintLower.includes("部署") ||
        hintLower.includes("所属") ||
        hintLower.includes("department")
      ) {
        valueToFill = payload.department || "";
      } else if (
        hintLower.includes("役職") ||
        hintLower.includes("肩書") ||
        hintLower.includes("position")
      ) {
        valueToFill = payload.title || "";
      } else if (
        hintLower.includes("姓") &&
        (hintLower.includes("ふりがな") ||
          hintLower.includes("カナ") ||
          hintLower.includes("kana"))
      ) {
        valueToFill = payload.lastNameKana || "";
      } else if (
        hintLower.includes("名") &&
        (hintLower.includes("ふりがな") ||
          hintLower.includes("カナ") ||
          hintLower.includes("kana"))
      ) {
        valueToFill = payload.firstNameKana || "";
      } else if (
        hintLower.includes("姓") ||
        hintLower.includes("苗字") ||
        hintLower.includes("last")
      ) {
        valueToFill = payload.lastName || "";
      } else if (
        hintLower.includes("名") &&
        !hintLower.includes("氏") &&
        !hintLower.includes("姓") &&
        !hintLower.includes("会社")
      ) {
        valueToFill = payload.firstName || "";
      } else if (
        hintLower.includes("ふりがな") ||
        hintLower.includes("フリガナ") ||
        hintLower.includes("よみがな") ||
        hintLower.includes("kana") ||
        hintLower.includes("カナ") ||
        hintLower.includes("かな") ||
        hintLower.includes("カタカナ") ||
        hintLower.includes("ヨミガナ")
      ) {
        valueToFill = payload.fullNameKana || "";
      } else if (
        hintLower.includes("名前") ||
        hintLower.includes("氏名") ||
        hintLower.includes("お名前") ||
        hintLower.includes("name")
      ) {
        valueToFill = payload.name || "";
      } else if (
        hintLower.includes("郵便") ||
        hintLower.includes("〒") ||
        hintLower.includes("zip") ||
        hintLower.includes("postal")
      ) {
        valueToFill = payload.postalCode || "";
      } else if (hintLower.includes("都道府県") || hintLower.includes("pref")) {
        valueToFill = payload.prefecture || "";
      } else if (hintLower.includes("市区町村") || hintLower.includes("city")) {
        valueToFill = payload.city || "";
      } else if (
        hintLower.includes("住所") ||
        hintLower.includes("番地") ||
        hintLower.includes("address")
      ) {
        valueToFill = payload.address || "";
      } else if (
        hintLower.includes("建物") ||
        hintLower.includes("ビル") ||
        hintLower.includes("building")
      ) {
        valueToFill = payload.building || "";
      } else {
        // 既知パターンに合わないが、必須フィールドの場合はデフォルト値を入力
        const isRequired =
          (await input.getAttribute("required")) !== null ||
          (await input.getAttribute("aria-required")) === "true";
        if (isRequired) {
          valueToFill = "テスト";
        }
      }

      if (valueToFill) {
        await input.fill(valueToFill, { timeout: 1000 });
        log(`Filled by hint [${hint}] with: ${valueToFill}`);
      }
    } catch {
      // 入力できない場合はスキップ
    }
  }

  // 必須セレクトのチェック（required属性とaria-required="true"の両方）
  const requiredSelects = formFound.locator(
    'select[required], select[aria-required="true"]',
  );
  const requiredSelectCount = await requiredSelects.count();
  for (let i = 0; i < requiredSelectCount; i++) {
    const select = requiredSelects.nth(i);
    try {
      const currentValue = await select.inputValue({ timeout: 2000 });
      if (!currentValue || currentValue.trim() === "") {
        // 最初の有効なオプションを選択
        const options = select.locator("option");
        const optionCount = await options.count();
        for (let j = 1; j < optionCount; j++) {
          const option = options.nth(j);
          const value = await option.getAttribute("value");
          if (value && value !== "") {
            await select.selectOption({ index: j });
            log(`Selected required select option index ${j}`);
            break;
          }
        }
      }
    } catch {
      // 選択できない場合はスキップ
    }
  }

  log(`✅ Form filling completed successfully`);
  return true;
}

async function submitForm(
  page: Page | Frame,
  log: (s: string) => void,
  dialogState: { detected: boolean; message: string },
): Promise<boolean> {
  const buttonSelectors = [
    // type="submit" ボタン（最優先）
    "button[type='submit']",
    "input[type='submit']",

    // テキストベース（日本語）
    "button:has-text('送信する')",
    "button:has-text('送信')",
    "button:has-text('送る')",
    "button:has-text('確認画面へ')",
    "button:has-text('確認する')",
    "button:has-text('確認')",
    "button:has-text('進む')",
    "button:has-text('次へ')",
    "input[value*='送信']",
    "input[value*='確認']",
    "input[value*='進む']",

    // テキストベース（英語）
    "button:has-text('Submit')",
    "button:has-text('Send')",
    "button:has-text('Confirm')",

    // type="button" でJavaScript送信するパターン
    "input[type='button'][value*='送信']",
    "input[type='button'][value*='確認']",
    "input[type='button'][onclick*='submit']",
    "button[onclick*='submit']",

    // クラス名ベース（一般的なパターン）
    ".wpcf7-form-control.wpcf7-submit",
    ".wpcf7-form-button",
    "button.hs-button",
    "input.hs-button",
    "button.submit-button",
    "button.btn-submit",
    ".submit-btn",
    "input.submit",
    "input.p-form__btn",
    ".p-form__btn",

    // 親要素内のボタン
    ".btnArea button",
    ".button-area button",
    "p button[type='submit']",
    "div button[type='submit']",
  ];

  log(`🔍 Searching for submit button...`);

  for (const sel of buttonSelectors) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) > 0) {
      log(`✓ Found submit button: ${sel}`);
      try {
        // disabled属性を一時的に削除してクリックを試みる
        const isDisabled = await btn.isDisabled().catch(() => false);
        if (isDisabled) {
          log(`⚠️ Button is disabled, attempting to enable...`);
          await btn
            .evaluate((el) => {
              if (
                el instanceof HTMLInputElement ||
                el instanceof HTMLButtonElement
              ) {
                el.disabled = false;
              }
            })
            .catch(() => {});
        }

        const urlBefore = page.url();
        log(`📍 Current URL before submit: ${urlBefore}`);

        // 送信ボタンをクリック
        log(`🖱️ Clicking submit button...`);
        await Promise.all([
          page
            .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 5000 })
            .catch(() => {}),
          btn.click({ timeout: 3000 }).catch(() => {}),
        ]);
        log(`✅ Submit button clicked successfully`);

        // クリック後に短時間待機（Ajax処理やDOM更新のため）
        await page.waitForTimeout(500);

        const urlAfter = page.url();
        log(`URL after click: ${urlAfter}`);

        // 確認画面の判定（ページ内容とボタンで判定）
        const pageText = await page
          .locator("body")
          .textContent()
          .catch(() => "");
        const confirmationKeywords = [
          "入力内容の確認",
          "入力内容をご確認",
          "内容確認",
          "確認画面",
          "ご確認ください",
          "以下の内容で送信",
          "この内容で送信",
          "Confirm your input",
          "Please confirm",
        ];
        const isConfirmationPage = confirmationKeywords.some((kw) =>
          pageText.includes(kw),
        );

        if (isConfirmationPage) {
          log(`📋 Confirmation page detected by content (URL: ${urlAfter})`);
        }

        // 確認画面の判定（最終送信ボタンがあるか）
        const confirmationSelectors = [
          "button:has-text('送信')",
          "button:has-text('送る')",
          "button:has-text('送信する')",
          "button:has-text('この内容で送信')",
          "button:has-text('確定')",
          "button:has-text('Submit')",
          "button:has-text('Send')",
          "input[type='submit'][value*='送信']",
          "input[type='button'][value*='送信']",
          "input[type='submit'][value*='確定']",
          "input[type='button'][value*='確定']",
          "input[type='submit'][value*='Submit']",
          "input[type='submit'][value*='Send']",
          ".wpcf7-form-button",
          "input.hs-button",
          "button.hs-button",
          "button.submit-button",
          "button.btn-submit",
          ".submit-btn",
        ];

        let finalBtn = null;
        for (const confirmSel of confirmationSelectors) {
          const candidate = page.locator(confirmSel).first();
          if ((await candidate.count()) > 0) {
            finalBtn = candidate;
            break;
          }
        }

        if (finalBtn) {
          log(`📋 Final submit button found on confirmation page, clicking...`);
          const urlBeforeFinal = page.url();

          await Promise.all([
            page
              .waitForNavigation({
                waitUntil: "domcontentloaded",
                timeout: 5000,
              })
              .catch(() => {}),
            finalBtn.click({ timeout: 3000 }).catch(() => {}),
          ]);
          log("Clicked final submit");
          await page.waitForTimeout(500);

          // 最終送信後のチェック
          return await verifySubmissionSuccess(
            page,
            urlBeforeFinal,
            dialogState.detected,
            dialogState.message,
            log,
          );
        }

        // 1回のクリックで完了の場合
        return await verifySubmissionSuccess(
          page,
          urlBefore,
          dialogState.detected,
          dialogState.message,
          log,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log(`Submit error: ${msg}`);
        // 次のセレクタを試す
      }
    }
  }

  log("❌ No submit button found on this page");
  return false;
}

// 送信成功の厳密な検証（高速化版）
async function verifySubmissionSuccess(
  page: Page | Frame,
  urlBefore: string,
  dialogDetected: boolean,
  dialogMessage: string,
  log: (s: string) => void,
): Promise<boolean> {
  const urlAfter = page.url();
  const urlChanged = urlAfter !== urlBefore;
  log(`📍 URL after submit: ${urlAfter} (changed: ${urlChanged})`);
  log(`🔍 Verifying submission success...`);

  // 0. ダイアログで成功メッセージが表示された場合
  if (dialogDetected && dialogMessage) {
    const successKeywords = [
      "ありがとう",
      "送信完了",
      "送信しました",
      "受け付けました",
      "thank you",
      "success",
      "submitted",
      "received",
      "完了",
    ];

    const messageLower = dialogMessage.toLowerCase();
    const hasSuccessKeyword = successKeywords.some((keyword) =>
      messageLower.includes(keyword.toLowerCase()),
    );

    if (hasSuccessKeyword) {
      log(`✅ Success dialog detected: "${dialogMessage}"`);
      return true;
    }

    // エラー系キーワードがあれば失敗
    const errorKeywords = [
      "エラー",
      "error",
      "失敗",
      "failed",
      "必須",
      "required",
    ];
    const hasErrorKeyword = errorKeywords.some((keyword) =>
      messageLower.includes(keyword.toLowerCase()),
    );
    if (hasErrorKeyword) {
      log(`❌ Error dialog detected: "${dialogMessage}"`);
      return false;
    }
  }

  // 1. ページ全体のテキストを一度に取得（高速）
  const pageText = await page
    .evaluate(() => {
      return document.body?.innerText || "";
    })
    .catch(() => "");

  const pageTextLower = pageText.toLowerCase();
  log(`📄 Page text length: ${pageText.length} characters`);

  // 2. エラーキーワードチェック（優先）
  log(`🔍 Checking for error keywords...`);
  const errorKeywords = [
    // 日本語
    "必須項目",
    "必須です",
    "入力してください",
    "入力されていません",
    "エラーが発生",
    "送信に失敗",
    "正しく入力",
    "確認してください",
    // 英語
    "required field",
    "please enter",
    "invalid",
    "error occurred",
    "failed to send",
    "please check",
    "validation error",
  ];

  for (const keyword of errorKeywords) {
    if (pageTextLower.includes(keyword.toLowerCase())) {
      log(`❌ Error keyword detected in page: "${keyword}"`);
      return false;
    }
  }
  log(`✓ No error keywords found`);

  // 3. 成功キーワードチェック
  log(`🔍 Checking for success keywords...`);
  const successKeywords = [
    // 日本語
    "ありがとうございました",
    "ありがとうございます",
    "お問い合わせを受け付けました",
    "お問い合わせいただきありがとう",
    "送信完了",
    "送信しました",
    "送信が完了しました",
    "送信が完了",
    "送信されました",
    "受け付けました",
    "受付完了",
    "完了しました",
    "お問い合わせいただき",
    "送信いただき",
    "お送りいただき",
    "承りました",
    "受信しました",
    "受領しました",
    // 英語
    "thank you",
    "thanks for",
    "successfully submitted",
    "message sent",
    "inquiry received",
    "request received",
    "submission successful",
    "form submitted",
    "message has been sent",
    "your message has been",
  ];

  for (const keyword of successKeywords) {
    if (pageTextLower.includes(keyword.toLowerCase())) {
      log(`✅ Success keyword detected in page: "${keyword}"`);
      return true;
    }
  }

  // 4. URL変化チェック（サンクスページへのリダイレクト）
  if (urlChanged) {
    const thanksPatterns = [
      "thanks",
      "thank-you",
      "complete",
      "success",
      "confirmation",
      "sent",
      "kanryou",
      "完了",
    ];

    const urlLower = urlAfter.toLowerCase();
    const isThanksPage = thanksPatterns.some((pattern) =>
      urlLower.includes(pattern),
    );

    if (isThanksPage) {
      log(`✅ Thanks page pattern detected in URL`);
      return true;
    }

    // URLが変化したが明確な成功表示なし = 推定成功
    log(`⚠️ URL changed but no clear success indicator. Assuming success.`);
    return true;
  }

  // 5. 総合判定：成功の証拠なし = 失敗
  log(
    `❌ No success indicators found. Submission failed (validation error or missing required fields).`,
  );
  return false;
}

async function locateFirst(
  page: Page | Frame,
  scope: ReturnType<Page["locator"]>,
  selectors: string[],
) {
  for (const sel of selectors) {
    const loc = scope.locator(sel).first();
    if ((await loc.count()) > 0) {
      // fill()できない要素タイプはスキップ（radio, checkbox, hidden）
      const inputType = await loc.getAttribute("type");
      if (
        inputType === "radio" ||
        inputType === "checkbox" ||
        inputType === "hidden"
      ) {
        continue;
      }
      return loc;
    }
  }
  return null;
}

async function findAndFillFormAnyContext(
  page: Page,
  payload: Payload,
  log: (s: string) => void,
): Promise<boolean | "blocked"> {
  const mainResult = await findAndFillForm(page, payload, log);
  if (mainResult === "blocked") return "blocked";
  if (mainResult === true) return true;
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const frameResult = await findAndFillForm(frame, payload, log);
    if (frameResult === "blocked") return "blocked";
    if (frameResult === true) return true;
  }
  return false;
}

async function submitFormAnyContext(
  page: Page,
  log: (s: string) => void,
): Promise<boolean> {
  // alert/confirm/promptダイアログの監視（Page レベルで設定）
  const dialogState = { detected: false, message: "" };
  const dialogHandler = async (dialog: import("playwright").Dialog) => {
    dialogState.message = dialog.message();
    dialogState.detected = true;
    log(`Dialog detected: ${dialog.type()} - "${dialogState.message}"`);
    await dialog.accept(); // 自動で閉じる
  };
  page.on("dialog", dialogHandler);

  try {
    if (await submitForm(page, log, dialogState)) return true;
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      if (await submitForm(frame, log, dialogState)) return true;
    }
    return false;
  } finally {
    // イベントリスナーをクリーンアップ
    page.off("dialog", dialogHandler);
  }
}

async function fillByLabel(
  page: Page | Frame,
  scope: ReturnType<Page["locator"]>,
  rules: Array<{ keywords: string[]; value?: string }>,
  log: (s: string) => void,
) {
  for (const rule of rules) {
    if (!rule.value) continue;
    for (const kw of rule.keywords) {
      const label = scope.locator("label", { hasText: kw }).first();
      if ((await label.count()) > 0) {
        const forId = await label.getAttribute("for");
        if (forId) {
          // CSS.escapeはNode.js環境で未定義のため、完全なエスケープを実装
          let escapedId = forId.replace(/([^\w-])/g, "\\$1");
          // 数字で始まる場合は \3X 形式でエスケープ（スペースで終端）
          if (/^[0-9]/.test(escapedId)) {
            escapedId = `\\3${escapedId[0]} ${escapedId.slice(1)}`;
          }
          const target = scope.locator(`#${escapedId}`);
          if ((await target.count()) > 0) {
            // チェックボックスやラジオボタンにはfill()できないのでスキップ
            const inputType = await target
              .getAttribute("type")
              .catch(() => null);
            if (
              inputType === "radio" ||
              inputType === "checkbox" ||
              inputType === "hidden"
            ) {
              continue;
            }
            await target.fill(rule.value, { timeout: 3000 }).catch(() => {});
            log(`Filled via label(${kw}) -> #${forId}`);
            break;
          }
        } else {
          const target = label.locator("input,textarea");
          if ((await target.count()) > 0) {
            await target
              .first()
              .fill(rule.value)
              .catch(() => {});
            log(`Filled via nested label(${kw})`);
            break;
          }
        }
      }
    }
  }
}

// 非同期バッチ処理エンドポイント（Vercelから呼ばれる、時間制限なし）
app.post("/auto-submit/batch-async", async (req, res) => {
  console.log("[batch-async] Received request");

  const { jobId, companyId, items, leadIds, debug } = req.body as {
    jobId: string;
    companyId: string;
    items: Payload[];
    leadIds: string[];
    debug?: boolean;
  };

  console.log(
    `[batch-async] Request body: jobId=${jobId}, companyId=${companyId}, items=${items?.length}, leadIds=${leadIds?.length}`,
  );

  if (!jobId || !companyId || !items || !leadIds) {
    console.error("[batch-async] Missing required fields");
    return res.status(400).json({
      error: "jobId, companyId, items, and leadIds are required",
    });
  }

  if (!supabase) {
    return res.status(500).json({
      error: "Supabase client not initialized",
    });
  }

  // 即座にレスポンス（非同期処理を開始）
  res.status(202).json({ message: "Batch processing started" });

  // バックグラウンドで処理を実行（await しない）
  (async () => {
    try {
      console.log(
        `[batch-async] Starting job ${jobId} with ${items.length} items`,
      );

      // ジョブステータスを "running" に更新
      await (supabase!.from("batch_jobs") as any)
        .update({
          status: "running",
          started_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      // ブラウザを1回だけ起動（Playwright推奨パターン）
      const browser = await chromium.launch({
        headless: !debug,
        slowMo: debug ? 200 : 0,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-gl-drawing-for-tests",
          "--disable-accelerated-2d-canvas",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-extensions",
          "--disable-plugins",
          "--memory-pressure-off",
        ],
      });

      const results: Array<{
        leadId: string;
        url: string;
        success: boolean;
        error?: string;
      }> = [];

      let completedCount = 0;
      let failedCount = 0;

      // 各アイテムを順次処理
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const leadId = leadIds[i];

        console.log(
          `[batch-async] [${i + 1}/${items.length}] Processing ${item.url} (leadId: ${leadId})`,
        );

        try {
          // 1件ごとの処理（新しいコンテキストで実行）
          const result = await autoSubmitWithBrowser(browser, item);

          if (result.success) {
            completedCount++;
            results.push({ leadId, url: item.url, success: true });

            // リードのステータスを "success" に更新
            await (supabase!.from("lead_lists") as any)
              .update({ send_status: "success" })
              .eq("id", leadId);
          } else {
            failedCount++;
            results.push({
              leadId,
              url: item.url,
              success: false,
              error: result.note || "Unknown error",
            });

            // リードのステータスを "failed" に更新
            await (supabase!.from("lead_lists") as any)
              .update({ send_status: "failed" })
              .eq("id", leadId);
          }

          // 進捗をDBに更新
          await (supabase!.from("batch_jobs") as any)
            .update({
              completed_items: completedCount,
              failed_items: failedCount,
              results: results,
            })
            .eq("id", jobId);

          console.log(
            `[batch-async] [${i + 1}/${items.length}] ${item.url} - success=${result.success}`,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[batch-async] [${i + 1}/${items.length}] Error: ${message}`,
          );

          failedCount++;
          results.push({
            leadId,
            url: item.url,
            success: false,
            error: message,
          });

          // リードのステータスを "failed" に更新
          await (supabase!.from("lead_lists") as any)
            .update({ send_status: "failed" })
            .eq("id", leadId);

          // 進捗をDBに更新
          await (supabase!.from("batch_jobs") as any)
            .update({
              completed_items: completedCount,
              failed_items: failedCount,
              results: results,
            })
            .eq("id", jobId);
        }
      }

      // ブラウザを閉じる
      await browser.close();

      // ジョブステータスを "completed" に更新
      await (supabase!.from("batch_jobs") as any)
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      console.log(
        `[batch-async] Job ${jobId} completed: ${completedCount} success, ${failedCount} failed`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[batch-async] Job ${jobId} failed: ${message}`);

      // ジョブステータスを "failed" に更新
      await (supabase!.from("batch_jobs") as any)
        .update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
  })();
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 Auto-submit server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Auto-submit:  POST http://localhost:${PORT}/auto-submit`);
});
