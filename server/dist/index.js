import express from "express";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
// ES Modules で __dirname を取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3001;
// Supabase クライアント（Service Role キー使用）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log("[server] Supabase client initialized");
}
else {
    console.warn("[server] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set - batch job features disabled");
}
// CORS設定（Vercelからのリクエストを許可）
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || [
        "http://localhost:3000",
    ],
    methods: ["POST", "OPTIONS"],
    credentials: true,
}));
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
        asyncQueueLength: asyncJobQueue.length,
        activeAsyncJobs: currentAsyncJobCount,
        maxAsyncJobs: MAX_CONCURRENT_ASYNC_JOBS,
        queueItems: sendQueue.map((item) => ({
            companyId: item.companyId,
            itemCount: item.items.length,
            waitingSeconds: Math.floor((Date.now() - item.addedAt.getTime()) / 1000),
        })),
    });
});
// ===== 同時実行制御のための変数 =====
// Railway/Docker環境ではリソース制限があるため1に設定
const MAX_CONCURRENT_BROWSERS = 1;
let currentBrowserCount = 0; // 現在実行中のブラウザ数
console.log(`[server] Starting with MAX_CONCURRENT_BROWSERS=${MAX_CONCURRENT_BROWSERS} (serial processing for stability)`);
const sendQueue = [];
let isProcessingQueue = false;
// ===== batch-async 用の同時実行制御（EAGAIN対策）=====
// NOTE: Railway ではメモリ/CPUより先に PID/FD 上限で spawn が失敗（EAGAIN）することがある。
// batch-async はリクエスト毎にバックグラウンド処理を起動するため、明示的にキューで直列化する。
// env ではなくコード側で固定（まずは安定性優先で1）
const MAX_CONCURRENT_ASYNC_JOBS = 1;
let currentAsyncJobCount = 0;
let isProcessingAsyncQueue = false;
const asyncJobQueue = [];
// ===== バッチ処理デバッグログ =====
// 最新のバッチ送信全体のログを1つのファイルに保存（上書き形式）
const BATCH_DEBUG_LOG_PATH = path.join(__dirname, "../debug-batch-submission.log");
let batchLogBuffer = [];
// ログをバッファに追加（コンソールにも出力）
function appendToBatchLog(message) {
    const timestamp = new Date().toISOString();
    batchLogBuffer.push(`[${timestamp}] ${message}`);
    console.log(message);
}
// ログをファイルに書き込み
function writeBatchLogToFile() {
    try {
        fs.writeFileSync(BATCH_DEBUG_LOG_PATH, batchLogBuffer.join("\n"), "utf-8");
        console.log(`📁 デバッグログを保存しました: ${BATCH_DEBUG_LOG_PATH}`);
    }
    catch (err) {
        console.error(`❌ デバッグログの保存に失敗: ${err}`);
    }
}
async function processAsyncJobQueue() {
    if (isProcessingAsyncQueue)
        return;
    if (asyncJobQueue.length === 0)
        return;
    if (currentAsyncJobCount >= MAX_CONCURRENT_ASYNC_JOBS)
        return;
    isProcessingAsyncQueue = true;
    try {
        while (asyncJobQueue.length > 0 &&
            currentAsyncJobCount < MAX_CONCURRENT_ASYNC_JOBS) {
            const item = asyncJobQueue.shift();
            if (!item)
                break;
            currentAsyncJobCount++;
            const waitedSec = Math.floor((Date.now() - item.addedAt.getTime()) / 1000);
            console.log(`[batch-async/queue] Dequeued job ${item.jobId} (companyId=${item.companyId}, waited=${waitedSec}s). Active async jobs: ${currentAsyncJobCount}/${MAX_CONCURRENT_ASYNC_JOBS}`);
            item
                .run()
                .catch((err) => {
                console.error(`[batch-async/queue] Job ${item.jobId} crashed: ${err instanceof Error ? err.message : String(err)}`);
            })
                .finally(() => {
                currentAsyncJobCount--;
                console.log(`[batch-async/queue] Job ${item.jobId} finished. Active async jobs: ${currentAsyncJobCount}/${MAX_CONCURRENT_ASYNC_JOBS}`);
                setTimeout(() => processAsyncJobQueue(), 100);
            });
        }
    }
    finally {
        isProcessingAsyncQueue = false;
    }
}
// メインのauto-submitエンドポイント（単一送信）
app.post("/auto-submit", async (req, res) => {
    const payload = req.body;
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
    }
    catch (error) {
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
    if (isProcessingQueue || sendQueue.length === 0)
        return;
    // 同時実行数チェック
    if (currentBrowserCount >= MAX_CONCURRENT_BROWSERS) {
        console.log(`[queue] Maximum browsers (${MAX_CONCURRENT_BROWSERS}) reached, waiting...`);
        return;
    }
    isProcessingQueue = true;
    try {
        while (sendQueue.length > 0 &&
            currentBrowserCount < MAX_CONCURRENT_BROWSERS) {
            const queueItem = sendQueue.shift();
            if (!queueItem)
                break;
            currentBrowserCount++;
            const waitTime = Math.floor((Date.now() - queueItem.addedAt.getTime()) / 1000);
            console.log(`[queue] Processing request (waited ${waitTime}s). Active browsers: ${currentBrowserCount}/${MAX_CONCURRENT_BROWSERS}`);
            // 非同期でバッチ処理を実行（並列処理）
            executeBatch(queueItem).finally(() => {
                currentBrowserCount--;
                console.log(`[queue] Request completed. Active browsers: ${currentBrowserCount}/${MAX_CONCURRENT_BROWSERS}`);
                // 次のキューアイテムを処理
                setTimeout(() => processQueue(), 100);
            });
        }
    }
    finally {
        isProcessingQueue = false;
    }
}
// 実際のバッチ処理実行（Playwright推奨: 1ブラウザ + 各アイテムで新しいコンテキスト）
async function executeBatch(queueItem) {
    const { res, items, debug, companyId } = queueItem;
    // SSE接続が切断されたかチェック
    let connectionClosed = false;
    res.on("close", () => {
        connectionClosed = true;
        console.log(`[executeBatch] Client disconnected for company ${companyId}`);
    });
    let browser = null;
    try {
        console.log(`[executeBatch] Starting batch for company ${companyId}: ${items.length} items`);
        res.write(`data: ${JSON.stringify({ type: "batch_start", queuePosition: 0 })}\n\n`);
        // バッチ全体で1つのブラウザを起動（リトライ付き）
        console.log(`[executeBatch] Launching single browser for entire batch`);
        const maxLaunchRetries = 3;
        for (let attempt = 1; attempt <= maxLaunchRetries; attempt++) {
            try {
                browser = await chromium.launch({
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
                        "--single-process",
                    ],
                });
                console.log(`[executeBatch] Browser launched successfully`);
                break;
            }
            catch (launchError) {
                const msg = launchError instanceof Error
                    ? launchError.message
                    : String(launchError);
                console.error(`[executeBatch] Browser launch failed (attempt ${attempt}): ${msg}`);
                if (attempt < maxLaunchRetries) {
                    await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                }
                else {
                    throw new Error(`Browser launch failed after ${maxLaunchRetries} attempts: ${msg}`);
                }
            }
        }
        if (!browser) {
            throw new Error("Browser launch failed");
        }
        res.write(`data: ${JSON.stringify({ type: "browser_ready" })}\n\n`);
        // 各アイテムを順次処理（各アイテムで新しいコンテキストを作成）
        for (let i = 0; i < items.length; i++) {
            // SSE接続が切断されていたら処理中断
            if (connectionClosed) {
                console.log(`[executeBatch] Connection closed, aborting batch at item ${i + 1}/${items.length}`);
                break;
            }
            const payload = items[i];
            try {
                // 処理開始を通知
                try {
                    res.write(`data: ${JSON.stringify({
                        type: "item_start",
                        index: i,
                        url: payload.url,
                    })}\n\n`);
                }
                catch (writeError) {
                    console.error(`[executeBatch] Failed to write item_start, connection may be closed`);
                    break;
                }
                console.log(`[auto-submit/batch] [${i + 1}/${items.length}] Processing ${payload.url}`);
                // フォーム送信処理（内部で新しいコンテキストを作成・破棄）
                const result = await autoSubmitWithBrowser(browser, payload);
                // 詳細ログ出力
                console.log(`[auto-submit/batch] [${i + 1}/${items.length}] ${payload.url} - success=${result.success}`);
                if (!result.success) {
                    console.log(`[auto-submit/batch] [${i + 1}/${items.length}] Failure reason: ${result.note || "Unknown"}`);
                    console.log(`[auto-submit/batch] [${i + 1}/${items.length}] Error logs:\n${result.logs.slice(-5).join("\n")}`);
                }
                // 処理完了を通知
                try {
                    res.write(`data: ${JSON.stringify({
                        type: "item_complete",
                        index: i,
                        url: payload.url,
                        success: result.success,
                        logs: result.logs,
                        finalUrl: result.finalUrl,
                        note: result.note,
                    })}\n\n`);
                }
                catch (writeError) {
                    console.error(`[executeBatch] Failed to write item_complete, connection may be closed`);
                    break;
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const stack = error instanceof Error ? error.stack : undefined;
                console.error(`[auto-submit/batch] [${i + 1}/${items.length}] Error: ${message}`);
                if (stack) {
                    console.error(`[auto-submit/batch] [${i + 1}/${items.length}] Stack trace: ${stack.split("\n").slice(0, 3).join(" | ")}`);
                }
                // ブラウザクラッシュの場合はバッチ全体を中断
                const isFatalError = message.includes("Browser closed") ||
                    message.includes("Protocol error");
                try {
                    res.write(`data: ${JSON.stringify({
                        type: "item_error",
                        index: i,
                        url: payload.url,
                        error: message,
                        fatal: isFatalError,
                    })}\n\n`);
                }
                catch (writeError) {
                    console.error(`[executeBatch] Failed to write item_error, connection may be closed`);
                    break;
                }
                if (isFatalError) {
                    console.error(`[executeBatch] Fatal browser error, aborting batch at item ${i + 1}/${items.length}`);
                    break;
                }
            }
        }
        // 全完了を通知
        if (!connectionClosed) {
            console.log(`[executeBatch] Batch completed for company ${companyId}: ${items.length} items processed`);
            try {
                res.write(`data: ${JSON.stringify({ type: "batch_complete", total: items.length })}\n\n`);
            }
            catch (writeError) {
                console.error(`[executeBatch] Failed to write batch_complete, connection already closed`);
            }
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[executeBatch] Fatal error for company ${companyId}: ${message}`);
        if (!connectionClosed) {
            try {
                res.write(`data: ${JSON.stringify({ type: "fatal_error", error: message })}\n\n`);
            }
            catch (writeError) {
                console.error(`[executeBatch] Failed to write fatal_error, connection already closed`);
            }
        }
    }
    finally {
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
    const { items, debug } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            error: "items array is required",
        });
    }
    // リクエスト元の企業識別（IPアドレスやヘッダーから取得可能）
    const companyId = req.headers["x-company-id"] ||
        req.ip ||
        `company_${Date.now()}`;
    // 現在のキューサイズ確認
    const queueLength = sendQueue.length;
    const estimatedWaitTime = Math.ceil((queueLength * 50) / MAX_CONCURRENT_BROWSERS); // 大雑把な見積もり
    // キューに追加
    const queueItem = {
        req,
        res,
        items,
        debug: debug || false,
        companyId,
        addedAt: new Date(),
    };
    sendQueue.push(queueItem);
    console.log(`[queue] Request from ${companyId} added. Queue size: ${sendQueue.length}, Estimated wait: ${estimatedWaitTime}s`);
    // SSE設定
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    // キュー情報を送信
    res.write(`data: ${JSON.stringify({
        type: "queued",
        position: queueLength,
        estimatedWaitTime,
        activeBrowsers: currentBrowserCount,
        maxBrowsers: MAX_CONCURRENT_BROWSERS,
    })}\n\n`);
    // キュー処理を開始
    processQueue();
});
// 既存ブラウザを使ったフォーム送信（バッチ用）
async function autoSubmitWithBrowser(browser, payload) {
    const logs = [];
    const startTime = Date.now();
    function log(line) {
        const elapsed = Date.now() - startTime;
        const entry = `[${elapsed}ms] ${line}`;
        logs.push(entry);
    }
    // ステップ進捗ログ用のヘルパー関数
    function logStep(stepNum, stepName, status, detail) {
        const emoji = status === 'success' ? '✅' : '❌';
        const statusText = status === 'success' ? '成功' : '失敗';
        const message = `${emoji} ステップ${stepNum} ${stepName}：${statusText}${detail ? ` (${detail})` : ''}`;
        log(message);
        console.log(message);
    }
    // 処理開始ログ
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 処理対象URL: ${payload.url}`);
    console.log(`🏢 企業名: ${payload.company}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    log(`=== autoSubmit START ===`);
    log(`Payload: url=${payload.url}, company=${payload.company}`);
    let context = null;
    let page = null;
    try {
        log(`[STEP 1] Creating browser context and page`);
        context = await browser.newContext();
        page = await context.newPage();
        log(`✓ Page created successfully`);
        logStep(1, 'ブラウザ準備', 'success');
        const startUrl = sanitizeUrl(payload.url);
        log(`[STEP 2] Navigating to initial URL: ${startUrl}`);
        try {
            await page.goto(startUrl, {
                waitUntil: "domcontentloaded",
                timeout: 30000,
            });
            log(`✓ Navigation completed, current URL: ${page.url()}`);
            logStep(2, 'サイトアクセス', 'success', page.url());
        }
        catch (navError) {
            const msg = navError instanceof Error ? navError.message : String(navError);
            log(`❌ [FAILED at STEP 2] Navigation failed: ${msg}`);
            logStep(2, 'サイトアクセス', 'failed', msg);
            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`📊 処理結果: ❌ 失敗`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            return {
                success: false,
                logs,
                finalUrl: page?.url(),
                note: `Navigation failed: ${msg}`,
            };
        }
        await page.waitForLoadState("networkidle").catch(() => {
            log(`⚠️ networkidle timeout (non-fatal)`);
        });
        // Try to find a contact page link and navigate if needed
        log(`[STEP 3] Finding contact page candidates...`);
        let contactUrls = [];
        try {
            contactUrls = await Promise.race([
                findContactPageCandidates(page, log),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Candidate search timeout")), 15000)),
            ]);
            log(`✓ Found ${contactUrls.length} candidates to try`);
            logStep(3, '問い合わせページ検索', 'success', `${contactUrls.length}件の候補`);
        }
        catch (err) {
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
            logStep(3, '問い合わせページ検索', 'success', `フォールバック使用（${contactUrls.length}件）`);
        }
        let formFound = false;
        // Try each candidate URL until we find a form
        log(`[STEP 4] Trying ${contactUrls.length} contact page candidates`);
        for (let i = 0; i < contactUrls.length; i++) {
            const contactUrl = contactUrls[i];
            log(`  [Candidate ${i + 1}/${contactUrls.length}] Trying: ${contactUrl}`);
            if (contactUrl === page.url()) {
                log(`  Already on this page, checking for form`);
            }
            else {
                try {
                    log(`  Navigating to: ${contactUrl}`);
                    await page.goto(contactUrl, {
                        waitUntil: "domcontentloaded",
                        timeout: 30000, // 30秒に延長
                    });
                    log(`  ✓ Navigation completed`);
                }
                catch (contactNavError) {
                    const msg = contactNavError instanceof Error
                        ? contactNavError.message
                        : String(contactNavError);
                    log(`  ✗ Navigation FAILED - ${msg}, trying next candidate`);
                    continue;
                }
                if (contactUrl.includes("#")) {
                    const hash = new URL(contactUrl).hash;
                    if (hash) {
                        const id = hash.replace("#", "");
                        const anchor = page.locator(`#${id}`);
                        if ((await anchor.count()) > 0) {
                            await anchor.scrollIntoViewIfNeeded().catch(() => { });
                        }
                    }
                }
            }
            // Try to locate a form and fill
            log(`[STEP 5] Searching for contact form...`);
            console.log(`🔍 [DEBUG] Starting form search on URL: ${page.url()}`);
            // 動的フォームの場合、少し待機してレンダリングを待つ
            console.log(`⏳ [DEBUG] Waiting 2s for dynamic form rendering...`);
            await page.waitForTimeout(2000);
            console.log(`✓ [DEBUG] Wait completed, proceeding to form search...`);
            try {
                console.log(`🔍 [DEBUG] Calling findAndFillFormAnyContext...`);
                const found = await Promise.race([
                    findAndFillFormAnyContext(page, payload, log),
                    new Promise((_, reject) => setTimeout(() => {
                        console.log(`⏱️ [DEBUG] Form search timeout (30s) - rejecting`);
                        reject(new Error("Form search timeout"));
                    }, 30000)),
                ]);
                console.log(`✓ [DEBUG] findAndFillFormAnyContext completed, result: ${found}`);
                if (found === "blocked") {
                    log(`❌ [FAILED at STEP 5] Form is protected by CAPTCHA`);
                    logStep(4, 'フォーム検索', 'failed', 'CAPTCHA検出');
                    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log(`📊 処理結果: ❌ 失敗`);
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                    return {
                        success: false,
                        logs,
                        finalUrl: page.url(),
                        note: "CAPTCHA detected",
                    };
                }
                if (found) {
                    // フォームが見つかったが、お問い合わせフォームとして妥当かチェック
                    // 検索フォームは入力フィールドが2個程度、お問い合わせは5個以上
                    const formSelectors = [
                        "form[action*='contact']",
                        "form[action*='inquiry']",
                        "form:has(input[type='email'])",
                        "form:has(input[name*='mail'])",
                        "form:has(textarea)",
                    ];
                    let isContactForm = false;
                    for (const fs of formSelectors) {
                        const contactForm = page.locator(fs).first();
                        if ((await contactForm.count()) > 0) {
                            const inputCount = await contactForm.locator("input:not([type='hidden']):not([type='submit']):not([type='button'])").count();
                            const textareaCount = await contactForm.locator("textarea").count();
                            const totalFields = inputCount + textareaCount;
                            console.log(`🔍 [DEBUG] Contact form check: ${fs}, fields=${totalFields}`);
                            if (totalFields >= 3) {
                                isContactForm = true;
                                log(`  ✓ Valid contact form found with ${totalFields} fields`);
                                break;
                            }
                        }
                    }
                    if (isContactForm) {
                        log(`✅ [STEP 5 SUCCESS] Form found and filled on URL: ${page.url()}`);
                        logStep(4, 'フォーム検索', 'success', page.url());
                        logStep(5, 'フォーム入力', 'success');
                        formFound = true;
                        break;
                    }
                    else {
                        log(`  ⚠️ Form found but appears to be a search form (too few fields), trying next candidate...`);
                    }
                }
                else {
                    log(`  No form found on this candidate, trying next...`);
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log(`  ⚠️ Form search failed: ${msg}, trying next candidate`);
                continue;
            }
        }
        if (!formFound) {
            log(`❌ [FAILED at STEP 5] No suitable contact form found on any candidate page`);
            logStep(4, 'フォーム検索', 'failed', 'フォームが見つかりませんでした');
            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`📊 処理結果: ❌ 失敗`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            return {
                success: false,
                logs,
                finalUrl: page.url(),
                note: "Form not found",
            };
        }
        // Try submit
        log(`[STEP 6] Submitting form`);
        const submitted = await submitFormAnyContext(page, log);
        if (submitted) {
            log(`✅ [STEP 6 SUCCESS] Form submitted successfully`);
            logStep(6, '送信ボタン押下', 'success');
            logStep(7, '送信確認', 'success', page.url());
        }
        else {
            log(`❌ [FAILED at STEP 6] Form submission failed`);
            logStep(6, '送信ボタン押下', 'failed');
        }
        const finalUrl = page.url();
        log(`=== autoSubmit END === success=${submitted}, finalUrl=${finalUrl}`);
        // 処理結果ログ
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📊 処理結果: ${submitted ? '✅ 成功' : '❌ 失敗'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return { success: submitted, logs, finalUrl };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
        log(`UNEXPECTED ERROR: ${message}`);
        console.log(`❌ エラー発生: ${message}`);
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📊 処理結果: ❌ 失敗`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return { success: false, logs, finalUrl: page?.url(), note: message };
    }
    finally {
        // リソースの確実なクリーンアップ（キャッシュ・コンテキストを完全クリア）
        log(`Cleaning up resources (page and context)`);
        if (page) {
            try {
                await page.close();
                log(`✓ Page closed successfully`);
            }
            catch (err) {
                log(`⚠️ Failed to close page: ${err}`);
                // エラーでも続行
            }
        }
        if (context) {
            try {
                await context.close();
                log(`✓ Context closed successfully (cache/storage cleared)`);
            }
            catch (err) {
                log(`⚠️ Failed to close context: ${err}`);
                // エラーでも続行
            }
        }
    }
}
// autoSubmit関数
async function autoSubmit(payload) {
    const logs = [];
    const startTime = Date.now();
    function log(line) {
        const elapsed = Date.now() - startTime;
        const entry = `[${elapsed}ms] ${line}`;
        logs.push(entry);
    }
    log(`=== autoSubmit START ===`);
    log(`Payload: url=${payload.url}, company=${payload.company}, department=${payload.department}, title=${payload.title}, email=${payload.email}`);
    let browser = null;
    let context = null;
    let page = null;
    try {
        log(`Step 1: Launching browser (headless=${!payload.debug})`);
        try {
            browser = await chromium.launch({
                headless: !payload.debug,
                slowMo: payload.debug ? 200 : 0,
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
                    "--single-process",
                    "--disable-extensions",
                    "--disable-plugins",
                    "--memory-pressure-off",
                ],
            });
            log(`Step 1: Browser launched successfully`);
        }
        catch (launchError) {
            const msg = launchError instanceof Error
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
        }
        catch (navError) {
            const msg = navError instanceof Error ? navError.message : String(navError);
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
            }
            catch (contactNavError) {
                const msg = contactNavError instanceof Error
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
                        await anchor.scrollIntoViewIfNeeded().catch(() => { });
                    }
                }
            }
        }
        else {
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
        log(submitted
            ? `Step 6: Form submitted successfully`
            : `Step 6: Form submission FAILED`);
        const finalUrl = page.url();
        log(`=== autoSubmit END === success=${submitted}, finalUrl=${finalUrl}`);
        return { success: submitted, logs, finalUrl };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
        const stack = error instanceof Error ? error.stack : undefined;
        log(`UNEXPECTED ERROR: ${message}`);
        if (stack)
            log(`Stack: ${stack.split("\n").slice(0, 3).join(" | ")}`);
        return { success: false, logs, finalUrl: page?.url(), note: message };
    }
    finally {
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
function sanitizeUrl(url) {
    if (!/^https?:\/\//i.test(url))
        return `https://${url}`;
    return url;
}
async function findContactPageCandidates(page, log) {
    const candidates = [];
    const seen = new Set();
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
        }
        catch (err) {
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
        }
        catch (err) {
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
                }
                catch (err) {
                    // Link extraction failed, continue
                }
            }
        }
        catch (err) {
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
        }
        catch (err) {
            // Invalid URL, skip
        }
    }
    // 候補数を制限（処理時間管理のため）
    const maxCandidates = 20;
    const limitedCandidates = candidates.slice(0, maxCandidates);
    log(`📋 Found ${candidates.length} contact page candidates, trying first ${limitedCandidates.length}:`);
    limitedCandidates.forEach((url, i) => {
        log(`  [${i + 1}] ${url}`);
    });
    return limitedCandidates;
}
async function findContactPage(page, log) {
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
            await anchor.scrollIntoViewIfNeeded().catch(() => { });
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
async function findAndFillForm(page, payload, log) {
    const formLocators = [
        "form[action*='contact']",
        "form[action*='inquiry']",
        "form[action*='toiawase']",
        "form:has(input[type='email'])",
        "form:has(input[name*='email'])",
        "form:has(input), form:has(textarea)",
    ];
    let formFound = null;
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
    // フォーム詳細情報をログ出力（デバッグ用）
    try {
        const formAction = await formFound.getAttribute("action", { timeout: 2000 });
        const formMethod = await formFound.getAttribute("method", { timeout: 2000 });
        const inputCount = await formFound.locator("input:not([type='hidden'])").count();
        const textareaCount = await formFound.locator("textarea").count();
        const selectCount = await formFound.locator("select").count();
        const radioCount = await formFound.locator("input[type='radio']").count();
        const checkboxCount = await formFound.locator("input[type='checkbox']").count();
        console.log(`📋 [DEBUG] Form details:`);
        console.log(`  - action: "${formAction}"`);
        console.log(`  - method: "${formMethod}"`);
        console.log(`  - inputs: ${inputCount}, textarea: ${textareaCount}, select: ${selectCount}`);
        console.log(`  - radio: ${radioCount}, checkbox: ${checkboxCount}`);
    }
    catch (e) {
        console.log(`⚠️ [DEBUG] Could not get form details: ${e}`);
    }
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
    const fieldStrategies = [
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
                // company2, company-2 など（NSK対応）
                "input[name='company2']",
                "input[name='company_2']",
                "input[name='company-2']",
                "input[id='company2']",
                "input[id='company_2']",
                "input[id='company-2']",
                // 標準的な部署フィールド
                "input[name*='department']",
                "input[name*='dept']",
                "input[id*='department']",
                "input[id*='dept']",
                "input[name*='division']",
                "input[id*='division']",
                "input[name*='busho']",
                "input[id*='busho']",
                "input[name*='section']",
                "input[id*='section']",
                "input[placeholder*='部署']",
                "input[placeholder*='所属']",
                "input[placeholder*='部門']",
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
                // name1, name_1, name-1 など（NSK対応）
                "input[name='name1']",
                "input[name='name_1']",
                "input[name='name-1']",
                "input[id='name1']",
                "input[id='name_1']",
                "input[id='name-1']",
                // 標準的な姓フィールド
                "input[name*='last_name']",
                "input[name*='last-name']",
                "input[name*='lastname']",
                "input[name*='family_name']",
                "input[name*='family-name']",
                "input[name*='sei']",
                "input[id*='last_name']",
                "input[id*='last-name']",
                "input[id*='lastname']",
                "input[id*='family_name']",
                "input[id*='family-name']",
                "input[id*='sei']",
                "input[placeholder*='姓']",
                "input[placeholder*='苗字']",
            ],
        },
        {
            value: payload.firstName,
            selectors: [
                // name2, name_2, name-2 など（NSK対応）
                "input[name='name2']",
                "input[name='name_2']",
                "input[name='name-2']",
                "input[id='name2']",
                "input[id='name_2']",
                "input[id='name-2']",
                // 標準的な名フィールド
                "input[name*='first_name']",
                "input[name*='first-name']",
                "input[name*='firstname']",
                "input[name*='given_name']",
                "input[name*='given-name']",
                "input[name*='mei']",
                "input[id*='first_name']",
                "input[id*='first-name']",
                "input[id*='firstname']",
                "input[id*='given_name']",
                "input[id*='given-name']",
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
                // NSKサイト等のkana1/kana2パターン
                "input[name='kana1']",
                "input[name='kana_1']",
                "input[name='kana-1']",
                "input[name*='kana_sei']",
                "input[name*='kana-sei']",
                "input[id='kana1']",
                "input[id='kana_1']",
                "input[id='kana-1']",
                // 一般的なパターン（_と-の両方に対応）
                "input[name*='last_name_kana']",
                "input[name*='last-name-kana']",
                "input[name*='lastname_kana']",
                "input[name*='lastname-kana']",
                "input[name*='sei_kana']",
                "input[name*='sei-kana']",
                "input[name*='myouji_kana']",
                "input[name*='myouji-kana']",
                "input[id*='last_name_kana']",
                "input[id*='last-name-kana']",
                "input[id*='lastname_kana']",
                "input[id*='lastname-kana']",
                "input[id*='sei_kana']",
                "input[id*='sei-kana']",
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
                // NSKサイト等のkana1/kana2パターン
                "input[name='kana2']",
                "input[name='kana_2']",
                "input[name='kana-2']",
                "input[name*='kana_mei']",
                "input[name*='kana-mei']",
                "input[id='kana2']",
                "input[id='kana_2']",
                "input[id='kana-2']",
                // 一般的なパターン（_と-の両方に対応）
                "input[name*='first_name_kana']",
                "input[name*='first-name-kana']",
                "input[name*='firstname_kana']",
                "input[name*='firstname-kana']",
                "input[name*='mei_kana']",
                "input[name*='mei-kana']",
                "input[id*='namae_kana']",
                "input[id*='namae-kana']",
                "input[id*='first_name_kana']",
                "input[id*='first-name-kana']",
                "input[id*='firstname_kana']",
                "input[id*='firstname-kana']",
                "input[id*='mei_kana']",
                "input[id*='mei-kana']",
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
                "input[type='email']", // 最優先
                "input[name='mail']", // 完全一致
                "input[name='email']", // 完全一致
                "input[name^='mail_']", // mail_で始まる
                "input[name^='email_']", // email_で始まる
                "input[name*='mailaddress']", // mailaddress
                "input[name*='mail'][name*='address']", // mail + address
                "input[name*='email'][name*='address']", // email + address
                "input[name*='mail']:not([name*='check']):not([name*='confirm'])", // mail（確認用除く）
                "input[id*='mail']:not([id*='check']):not([id*='confirm'])",
                "input[placeholder*='メール']",
                "input[placeholder*='mail']",
                "input[placeholder*='email']",
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
                // メールアドレスを除外して住所のみを対象に
                "input[name*='address']:not([type='email']):not([name*='mail'])",
                "input[name*='jusho']",
                "input[name*='street']",
                "input[name*='town']",
                "input[name*='banchi']",
                "input[id*='address']:not([type='email']):not([id*='mail'])",
                "input[id*='jusho']",
                "input[id*='street']",
                "input[placeholder*='住所']",
                "input[placeholder*='番地']",
                "input[placeholder*='町名']",
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
    // ふりがな関連セレクターのパターン
    const furiganaPatterns = /kana|hurigana|furigana|ふりがな|フリガナ|カナ|かな|よみがな|ヨミガナ|セイ|メイ|せい|めい/i;
    console.log(`📝 [DEBUG] Starting field filling via fieldStrategies (${fieldStrategies.length} strategies)...`);
    let filledFieldsCount = 0;
    for (const { value, selectors } of fieldStrategies) {
        if (!value)
            continue;
        const found = await locateFirst(page, formFound, selectors);
        if (found) {
            // ふりがなフィールドの場合、DOM解析で適切な値を決定
            let valueToFill = value;
            const isFuriganaSelector = selectors.some((sel) => furiganaPatterns.test(sel));
            if (isFuriganaSelector) {
                const spec = await analyzeFuriganaField(page, found, log);
                // 姓名タイプに基づいて値を選択
                if (spec.type === "lastName" && payload.lastNameKana) {
                    valueToFill = payload.lastNameKana;
                }
                else if (spec.type === "firstName" && payload.firstNameKana) {
                    valueToFill = payload.firstNameKana;
                }
                else if (payload.fullNameKana) {
                    valueToFill = payload.fullNameKana;
                }
                // フォーマットに基づいて変換
                if (spec.format === "katakana" && containsHiragana(valueToFill)) {
                    valueToFill = hiraganaToKatakana(valueToFill);
                    log(`  → 変換: ひらがな→カタカナ: "${valueToFill}"`);
                }
                else if (spec.format === "hiragana" && containsKatakana(valueToFill)) {
                    valueToFill = katakanaToHiragana(valueToFill);
                    log(`  → 変換: カタカナ→ひらがな: "${valueToFill}"`);
                }
            }
            await found.fill(valueToFill);
            log(`Filled field via ${selectors[0]}: "${valueToFill}"`);
            // 詳細ログ
            const fieldName = await found.getAttribute("name", { timeout: 1000 }).catch(() => "unknown");
            const fieldType = await found.getAttribute("type", { timeout: 1000 }).catch(() => "text");
            console.log(`  ✓ [DEBUG] name="${fieldName}", type="${fieldType}", value="${valueToFill.substring(0, 30)}..."`);
            filledFieldsCount++;
        }
        else {
            console.log(`  ⚠️ [DEBUG] Field not found for value: "${value.substring(0, 30)}..." (tried ${selectors.length} selectors)`);
        }
    }
    console.log(`📝 [DEBUG] fieldStrategies completed: ${filledFieldsCount} fields filled`);
    // デバッグ: フォーム内の全テキストフィールドをダンプ
    console.log(`🔍 [DEBUG] Dumping all form text fields...`);
    const allTextFields = formFound.locator("input[type='text'], input:not([type])");
    const textFieldCount = await allTextFields.count();
    for (let i = 0; i < Math.min(textFieldCount, 30); i++) {
        try {
            const field = allTextFields.nth(i);
            const name = await field.getAttribute("name").catch(() => "");
            const id = await field.getAttribute("id").catch(() => "");
            const placeholder = await field.getAttribute("placeholder").catch(() => "");
            const value = await field.inputValue().catch(() => "");
            console.log(`  Field ${i}: name="${name}", id="${id}", placeholder="${placeholder}", value="${value.substring(0, 20)}..."`);
        }
        catch (err) {
            console.log(`  Field ${i}: Error reading attributes`);
        }
    }
    console.log(`🔍 [DEBUG] Total text fields found: ${textFieldCount}`);
    await fillByLabel(page, formFound, [
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
                "フリガナ", // カタカナ優先（NSK等のサイト対応）
                "カナ",
                "カタカナ",
                "ヨミガナ",
                "氏名（カタカナ）",
                "氏名(カタカナ)",
                "氏名（カナ）",
                "氏名(カナ)",
                "お名前（カナ）",
                "お名前(カナ)",
                "ふりがな", // ひらがなは後回し
                "かな",
                "よみがな",
                "氏名（ふりがな）",
                "氏名(ふりがな)",
                "Furigana",
                "Kana",
            ],
            // カタカナで送信（ひらがなの場合は自動変換）
            value: payload.fullNameKana && containsHiragana(payload.fullNameKana)
                ? hiraganaToKatakana(payload.fullNameKana)
                : payload.fullNameKana,
        },
        {
            keywords: [
                "姓（カナ）", // カタカナ優先
                "姓（フリガナ）",
                "姓（カタカナ）",
                "姓(カナ)",
                "セイ",
                "ミョウジ",
                "姓（ふりがな）", // ひらがなは後回し
                "姓(ふりがな)",
                "せい",
                "みょうじ",
            ],
            value: payload.lastNameKana && containsHiragana(payload.lastNameKana)
                ? hiraganaToKatakana(payload.lastNameKana)
                : payload.lastNameKana,
        },
        {
            keywords: [
                "名（カナ）", // カタカナ優先
                "名（フリガナ）",
                "名（カタカナ）",
                "名(カナ)",
                "メイ",
                "ナマエ",
                "名（ふりがな）", // ひらがなは後回し
                "名(ふりがな)",
                "めい",
                "なまえ",
            ],
            value: payload.firstNameKana && containsHiragana(payload.firstNameKana)
                ? hiraganaToKatakana(payload.firstNameKana)
                : payload.firstNameKana,
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
    ], log, payload);
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
    // セレクトボックス：最初の有効なオプションを選択（タイムアウト追加で高速化）
    const selects = formFound.locator("select");
    const selectCount = await selects.count();
    for (let i = 0; i < selectCount; i++) {
        const select = selects.nth(i);
        try {
            const options = select.locator("option");
            const optionCount = await options.count();
            for (let j = 0; j < optionCount; j++) {
                const option = options.nth(j);
                const value = (await option.getAttribute("value", { timeout: 3000 })) || "";
                const text = (await option.textContent()) || "";
                // 空の値や「選択してください」系をスキップ
                if (value !== "" &&
                    !text.includes("選択") &&
                    !text.includes("---") &&
                    !text.includes("未選択")) {
                    await select.selectOption({ index: j }, { timeout: 5000 });
                    log(`Selected option "${text.trim()}" in select[${i}]`);
                    break;
                }
            }
        }
        catch (err) {
            log(`⚠️ Failed to select option in select[${i}]: ${err}`);
            // 選択できない場合はスキップ
        }
    }
    // チェックボックス：全てチェック（タイムアウト3秒）
    console.log(`☑️ [DEBUG] Processing checkboxes...`);
    const checkboxes = formFound.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    console.log(`  Found ${checkboxCount} checkboxes`);
    for (let i = 0; i < checkboxCount; i++) {
        const checkbox = checkboxes.nth(i);
        try {
            const isChecked = await checkbox.isChecked({ timeout: 3000 });
            if (!isChecked) {
                await checkbox.check({ timeout: 3000, force: true });
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
                log(`Checked checkbox[${i}]: ${labelText.trim() || checkboxName || "unlabeled"}`);
            }
        }
        catch {
            // チェックできない場合はスキップ
        }
    }
    // ラジオボタン：ラベルを解析して適切な選択肢を選択（タイムアウト3秒）
    console.log(`🔘 [DEBUG] Processing radio buttons...`);
    const radioGroups = new Set();
    const radios = formFound.locator('input[type="radio"]');
    const radioCount = await radios.count();
    console.log(`  Found ${radioCount} radio buttons`);
    for (let i = 0; i < radioCount; i++) {
        const radio = radios.nth(i);
        try {
            const name = await radio.getAttribute("name", { timeout: 3000 });
            if (!name || radioGroups.has(name))
                continue;
            // グループ内の全ラジオボタンを取得
            const groupRadios = formFound.locator(`input[type="radio"][name="${name}"]`);
            const groupCount = await groupRadios.count();
            // 優先順位: 「その他」「お問い合わせ」「希望する」など一般的な選択肢を探す
            let selectedIndex = 0;
            let foundPreferred = false;
            for (let j = 0; j < groupCount; j++) {
                try {
                    const radioOption = groupRadios.nth(j);
                    const radioId = await radioOption.getAttribute("id", { timeout: 2000 });
                    const radioValue = await radioOption.getAttribute("value", { timeout: 2000 }) || "";
                    // ラベルテキストを取得
                    let labelText = "";
                    if (radioId) {
                        const label = formFound.locator(`label[for="${radioId}"]`).first();
                        if ((await label.count()) > 0) {
                            labelText = (await label.textContent()) || "";
                        }
                    }
                    // label が見つからない場合、親の label を探す
                    if (!labelText) {
                        const parentLabel = radioOption.locator("xpath=ancestor::label").first();
                        if ((await parentLabel.count()) > 0) {
                            labelText = (await parentLabel.textContent()) || "";
                        }
                    }
                    const textToCheck = `${labelText} ${radioValue}`.toLowerCase();
                    // 「その他」は除外（追加入力が必要になるため）
                    // 「希望する」「お問い合わせ」「資料請求」「見積依頼」などを優先
                    if (/その他/.test(textToCheck)) {
                        // 「その他」はスキップ
                        continue;
                    }
                    // 有用な選択肢を優先的に選択
                    if (/資料請求|提案依頼|見積|お問い合わせ|問合せ|希望する|はい|同意する|了承/i.test(textToCheck)) {
                        selectedIndex = j;
                        foundPreferred = true;
                        log(`  Found preferred radio option: "${labelText.trim()}" in group "${name}"`);
                        break;
                    }
                }
                catch {
                    // オプションの取得に失敗した場合はスキップ
                }
            }
            // 選択を実行
            const targetRadio = groupRadios.nth(selectedIndex);
            const isChecked = await targetRadio.isChecked({ timeout: 3000 });
            if (!isChecked) {
                await targetRadio.check({ timeout: 3000, force: true });
                log(`Selected radio in group "${name}" (index: ${selectedIndex}${foundPreferred ? ', preferred' : ', first'})`);
            }
            radioGroups.add(name);
        }
        catch {
            // 選択できない場合はスキップ
        }
    }
    // 必須フィールドの最終チェック：未入力の必須フィールドにプレースホルダーベースで値を入力
    // required属性だけでなく、aria-required="true"も検出
    const requiredInputs = formFound.locator('input[required]:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"]), input[aria-required="true"]:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"])');
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
                const fieldHint = `${inputName}${inputId}${placeholder}${ariaLabel}${title}${labelText}`.toLowerCase();
                let defaultValue = "";
                // メールアドレス
                if (inputType === "email" ||
                    fieldHint.includes("mail") ||
                    fieldHint.includes("メール")) {
                    defaultValue = payload.email || "test@example.com";
                    // 電話番号
                }
                else if (inputType === "tel" ||
                    fieldHint.includes("tel") ||
                    fieldHint.includes("phone") ||
                    fieldHint.includes("電話")) {
                    defaultValue = payload.phone || "03-1234-5678";
                    // 姓（漢字）
                }
                else if (fieldHint.includes("last_name") ||
                    fieldHint.includes("lastname") ||
                    fieldHint.includes("sei") ||
                    (fieldHint.includes("姓") &&
                        !fieldHint.includes("ふりがな") &&
                        !fieldHint.includes("カナ"))) {
                    defaultValue = payload.lastName || "山田";
                    // 名（漢字）
                }
                else if (fieldHint.includes("first_name") ||
                    fieldHint.includes("firstname") ||
                    fieldHint.includes("mei") ||
                    (fieldHint.includes("名") &&
                        !fieldHint.includes("姓") &&
                        !fieldHint.includes("会社") &&
                        !fieldHint.includes("氏") &&
                        !fieldHint.includes("ふりがな") &&
                        !fieldHint.includes("カナ"))) {
                    defaultValue = payload.firstName || "太郎";
                    // 姓（ふりがな）
                }
                else if ((fieldHint.includes("姓") &&
                    (fieldHint.includes("ふりがな") || fieldHint.includes("カナ"))) ||
                    fieldHint.includes("せい") ||
                    fieldHint.includes("みょうじ")) {
                    defaultValue = payload.lastNameKana || "やまだ";
                    // 名（ふりがな）
                }
                else if ((fieldHint.includes("名") &&
                    (fieldHint.includes("ふりがな") || fieldHint.includes("カナ"))) ||
                    fieldHint.includes("めい") ||
                    fieldHint.includes("なまえ")) {
                    defaultValue = payload.firstNameKana || "たろう";
                    // フルネーム（ふりがな）
                }
                else if (fieldHint.includes("kana") ||
                    fieldHint.includes("フリガナ") ||
                    fieldHint.includes("ふりがな") ||
                    fieldHint.includes("hurigana") ||
                    fieldHint.includes("よみがな") ||
                    fieldHint.includes("カナ") ||
                    fieldHint.includes("かな") ||
                    fieldHint.includes("カタカナ") ||
                    fieldHint.includes("ヨミガナ")) {
                    defaultValue = payload.fullNameKana || "やまだ たろう";
                    // 氏名・名前
                }
                else if (fieldHint.includes("name") ||
                    fieldHint.includes("氏名") ||
                    fieldHint.includes("名前") ||
                    fieldHint.includes("お名前")) {
                    defaultValue = payload.name || "山田 太郎";
                    // 会社名
                }
                else if (fieldHint.includes("company") ||
                    fieldHint.includes("corp") ||
                    fieldHint.includes("会社") ||
                    fieldHint.includes("企業") ||
                    fieldHint.includes("御社") ||
                    fieldHint.includes("貴社")) {
                    defaultValue = payload.company || "テスト株式会社";
                    // 部署
                }
                else if (fieldHint.includes("department") ||
                    fieldHint.includes("division") ||
                    fieldHint.includes("busho") ||
                    fieldHint.includes("部署") ||
                    fieldHint.includes("所属")) {
                    defaultValue = payload.department || "営業部";
                    // 役職
                }
                else if (fieldHint.includes("position") ||
                    fieldHint.includes("post") ||
                    fieldHint.includes("title") ||
                    fieldHint.includes("役職") ||
                    fieldHint.includes("肩書")) {
                    defaultValue = payload.title || "";
                    // 郵便番号
                }
                else if (fieldHint.includes("zip") ||
                    fieldHint.includes("postal") ||
                    fieldHint.includes("郵便") ||
                    fieldHint.includes("〒")) {
                    defaultValue = payload.postalCode || "";
                    // 都道府県
                }
                else if (fieldHint.includes("pref") ||
                    fieldHint.includes("都道府県") ||
                    fieldHint.includes("todofuken")) {
                    defaultValue = payload.prefecture || "";
                    // 市区町村
                }
                else if (fieldHint.includes("city") ||
                    fieldHint.includes("市区町村") ||
                    fieldHint.includes("shiku")) {
                    defaultValue = payload.city || "";
                    // 住所
                }
                else if (fieldHint.includes("address") ||
                    fieldHint.includes("street") ||
                    fieldHint.includes("住所") ||
                    fieldHint.includes("番地")) {
                    defaultValue = payload.address || "";
                    // 建物名
                }
                else if (fieldHint.includes("building") ||
                    fieldHint.includes("建物") ||
                    fieldHint.includes("ビル") ||
                    fieldHint.includes("マンション")) {
                    defaultValue = payload.building || "";
                    // URL
                }
                else if (fieldHint.includes("url") ||
                    fieldHint.includes("website") ||
                    fieldHint.includes("homepage") ||
                    fieldHint.includes("ホームページ")) {
                    defaultValue = "https://example.com";
                    // その他
                }
                else {
                    defaultValue = "テスト";
                }
                if (defaultValue) {
                    await input.fill(defaultValue, { timeout: 2000 });
                    log(`Filled required field [${inputName || inputId || placeholder}] with: ${defaultValue}`);
                }
            }
        }
        catch {
            // 入力できない場合はスキップ
        }
    }
    // 必須テキストエリアのチェック（required属性とaria-required="true"の両方）
    const requiredTextareas = formFound.locator('textarea[required], textarea[aria-required="true"]');
    const requiredTextareaCount = await requiredTextareas.count();
    for (let i = 0; i < requiredTextareaCount; i++) {
        const textarea = requiredTextareas.nth(i);
        try {
            const currentValue = await textarea.inputValue({ timeout: 2000 });
            if (!currentValue || currentValue.trim() === "") {
                await textarea.fill(payload.message ||
                    "お問い合わせありがとうございます。詳細についてご連絡ください。", { timeout: 2000 });
                log(`Filled required textarea with default message`);
            }
        }
        catch {
            // 入力できない場合はスキップ
        }
    }
    // 必須マーク（*、必須など）が付いているフィールドも検出して入力
    const allInputsForRequiredCheck = formFound.locator('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"]):not([type="button"])');
    const allInputsForRequiredCheckCount = await allInputsForRequiredCheck.count();
    for (let i = 0; i < allInputsForRequiredCheckCount; i++) {
        const input = allInputsForRequiredCheck.nth(i);
        try {
            const currentValue = await input.inputValue({ timeout: 1000 });
            if (currentValue && currentValue.trim() !== "")
                continue;
            const inputId = (await input.getAttribute("id")) || "";
            let labelText = "";
            if (inputId) {
                const label = formFound.locator(`label[for="${inputId}"]`).first();
                if ((await label.count()) > 0) {
                    labelText = (await label.textContent()) || "";
                }
            }
            // ラベルに「*」「必須」「※」などが含まれている場合は必須と判定
            const isLikelyRequired = labelText.includes("*") ||
                labelText.includes("必須") ||
                labelText.includes("※") ||
                labelText.includes("required");
            if (!isLikelyRequired)
                continue;
            // 必須と判定されたフィールドにデフォルト値を入力
            const inputName = (await input.getAttribute("name")) || "";
            const inputType = (await input.getAttribute("type")) || "text";
            const placeholder = (await input.getAttribute("placeholder")) || "";
            const ariaLabel = (await input.getAttribute("aria-label")) || "";
            const title = (await input.getAttribute("title")) || "";
            const fieldHint = `${inputName}${inputId}${placeholder}${ariaLabel}${title}${labelText}`.toLowerCase();
            let defaultValue = "";
            if (inputType === "email" ||
                fieldHint.includes("mail") ||
                fieldHint.includes("メール")) {
                defaultValue = payload.email || "test@example.com";
            }
            else if (inputType === "tel" ||
                fieldHint.includes("tel") ||
                fieldHint.includes("phone") ||
                fieldHint.includes("電話")) {
                defaultValue = payload.phone || "03-1234-5678";
            }
            else if (fieldHint.includes("company") ||
                fieldHint.includes("会社") ||
                fieldHint.includes("企業")) {
                defaultValue = payload.company || "テスト株式会社";
            }
            else if (fieldHint.includes("name") ||
                fieldHint.includes("氏名") ||
                fieldHint.includes("名前")) {
                defaultValue = payload.name || "山田 太郎";
            }
            else if (fieldHint.includes("姓") &&
                !fieldHint.includes("ふりがな") &&
                !fieldHint.includes("カナ")) {
                defaultValue = payload.lastName || "山田";
            }
            else if (fieldHint.includes("名") &&
                !fieldHint.includes("姓") &&
                !fieldHint.includes("氏") &&
                !fieldHint.includes("ふりがな") &&
                !fieldHint.includes("カナ")) {
                defaultValue = payload.firstName || "太郎";
            }
            else if (fieldHint.includes("kana") ||
                fieldHint.includes("ふりがな") ||
                fieldHint.includes("フリガナ")) {
                defaultValue = payload.fullNameKana || "やまだ たろう";
            }
            else if (fieldHint.includes("subject") ||
                fieldHint.includes("件名") ||
                fieldHint.includes("タイトル")) {
                defaultValue = "お問い合わせ";
            }
            else {
                defaultValue = "テスト";
            }
            if (defaultValue) {
                await input.fill(defaultValue, { timeout: 1000 });
                log(`Filled required-marked field [${labelText.trim() || inputName || inputId}] with: ${defaultValue}`);
            }
        }
        catch {
            // 入力できない場合はスキップ
        }
    }
    // 空のフィールドに対してプレースホルダー/aria-label/titleベースで追加入力（required属性がなくても）
    const allInputs = formFound.locator('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"]):not([type="button"])');
    const allInputCount = await allInputs.count();
    for (let i = 0; i < allInputCount; i++) {
        const input = allInputs.nth(i);
        try {
            const currentValue = await input.inputValue({ timeout: 1000 });
            if (currentValue && currentValue.trim() !== "")
                continue; // 既に入力済みならスキップ
            // placeholder, aria-label, title の順で取得
            const placeholder = (await input.getAttribute("placeholder")) || "";
            const ariaLabel = (await input.getAttribute("aria-label")) || "";
            const title = (await input.getAttribute("title")) || "";
            const hint = placeholder || ariaLabel || title;
            // ヒントがない場合でも、必須フィールドなら「テスト」を入力
            if (!hint) {
                const isRequired = (await input.getAttribute("required")) !== null ||
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
            if (hintLower.includes("メール") ||
                hintLower.includes("mail") ||
                hintLower.includes("email")) {
                valueToFill = payload.email || "";
            }
            else if (hintLower.includes("電話") ||
                hintLower.includes("tel") ||
                hintLower.includes("phone")) {
                valueToFill = payload.phone || "";
            }
            else if (hintLower.includes("会社") ||
                hintLower.includes("企業") ||
                hintLower.includes("御社") ||
                hintLower.includes("貴社") ||
                hintLower.includes("company")) {
                valueToFill = payload.company || "";
            }
            else if (hintLower.includes("部署") ||
                hintLower.includes("所属") ||
                hintLower.includes("department")) {
                valueToFill = payload.department || "";
            }
            else if (hintLower.includes("役職") ||
                hintLower.includes("肩書") ||
                hintLower.includes("position")) {
                valueToFill = payload.title || "";
            }
            else if (hintLower.includes("姓") &&
                (hintLower.includes("ふりがな") ||
                    hintLower.includes("カナ") ||
                    hintLower.includes("kana"))) {
                valueToFill = payload.lastNameKana || "";
            }
            else if (hintLower.includes("名") &&
                (hintLower.includes("ふりがな") ||
                    hintLower.includes("カナ") ||
                    hintLower.includes("kana"))) {
                valueToFill = payload.firstNameKana || "";
            }
            else if (hintLower.includes("姓") ||
                hintLower.includes("苗字") ||
                hintLower.includes("last")) {
                valueToFill = payload.lastName || "";
            }
            else if (hintLower.includes("名") &&
                !hintLower.includes("氏") &&
                !hintLower.includes("姓") &&
                !hintLower.includes("会社")) {
                valueToFill = payload.firstName || "";
            }
            else if (hintLower.includes("ふりがな") ||
                hintLower.includes("フリガナ") ||
                hintLower.includes("よみがな") ||
                hintLower.includes("kana") ||
                hintLower.includes("カナ") ||
                hintLower.includes("かな") ||
                hintLower.includes("カタカナ") ||
                hintLower.includes("ヨミガナ")) {
                valueToFill = payload.fullNameKana || "";
            }
            else if (hintLower.includes("名前") ||
                hintLower.includes("氏名") ||
                hintLower.includes("お名前") ||
                hintLower.includes("name")) {
                valueToFill = payload.name || "";
            }
            else if (hintLower.includes("郵便") ||
                hintLower.includes("〒") ||
                hintLower.includes("zip") ||
                hintLower.includes("postal")) {
                valueToFill = payload.postalCode || "";
            }
            else if (hintLower.includes("都道府県") || hintLower.includes("pref")) {
                valueToFill = payload.prefecture || "";
            }
            else if (hintLower.includes("市区町村") || hintLower.includes("city")) {
                valueToFill = payload.city || "";
            }
            else if (hintLower.includes("住所") ||
                hintLower.includes("番地") ||
                hintLower.includes("address")) {
                valueToFill = payload.address || "";
            }
            else if (hintLower.includes("建物") ||
                hintLower.includes("ビル") ||
                hintLower.includes("building")) {
                valueToFill = payload.building || "";
            }
            else {
                // 既知パターンに合わないが、必須フィールドの場合はデフォルト値を入力
                const isRequired = (await input.getAttribute("required")) !== null ||
                    (await input.getAttribute("aria-required")) === "true";
                if (isRequired) {
                    valueToFill = "テスト";
                }
            }
            if (valueToFill) {
                await input.fill(valueToFill, { timeout: 1000 });
                log(`Filled by hint [${hint}] with: ${valueToFill}`);
            }
        }
        catch {
            // 入力できない場合はスキップ
        }
    }
    // 必須セレクトのチェック（required属性とaria-required="true"の両方）
    const requiredSelects = formFound.locator('select[required], select[aria-required="true"]');
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
        }
        catch {
            // 選択できない場合はスキップ
        }
    }
    log(`✅ Form filling completed successfully`);
    return true;
}
// バリデーションエラーをチェックする関数
async function checkValidationErrors(page, log) {
    const errorSelectors = [
        ".error",
        ".error-message",
        ".validation-error",
        ".form-error",
        ".field-error",
        ".input-error",
        '[class*="error"]:not(input):not(select):not(textarea)',
        '[class*="invalid"]:not(input):not(select):not(textarea)',
        'p.error',
        'span.error',
        'div.error',
        '[role="alert"]',
    ];
    const errors = [];
    try {
        for (const selector of errorSelectors) {
            const errorElements = page.locator(selector);
            const count = await errorElements.count().catch(() => 0);
            for (let i = 0; i < count; i++) {
                try {
                    const element = errorElements.nth(i);
                    const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false);
                    if (isVisible) {
                        const text = await element.textContent({ timeout: 1000 }).catch(() => "");
                        if (text && text.trim() && text.length < 200) {
                            // 重複を避ける
                            const trimmedText = text.trim();
                            if (!errors.includes(trimmedText)) {
                                errors.push(trimmedText);
                            }
                        }
                    }
                }
                catch {
                    // 要素の取得に失敗した場合はスキップ
                }
            }
        }
    }
    catch (err) {
        log(`⚠️ Error checking validation: ${err}`);
    }
    if (errors.length > 0) {
        log(`⚠️ Validation errors detected (${errors.length}): ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "..." : ""}`);
    }
    return errors;
}
async function submitForm(page, log, dialogState) {
    log(`🚀 [submitForm] 開始`);
    console.log(`🚀 [submitForm] 開始`);
    // 送信前にバリデーションエラーをチェック
    log(`🔍 [submitForm] バリデーションエラーチェック中...`);
    const validationErrors = await checkValidationErrors(page, log);
    log(`🔍 [submitForm] バリデーションエラーチェック完了: ${validationErrors.length}件`);
    if (validationErrors.length > 0) {
        log(`⚠️ Found ${validationErrors.length} validation error(s) before submit`);
        // エラーがあっても送信を試みる（サイトによってはエラー表示が残っている場合があるため）
    }
    // ステップ1: まず「送信」ボタンを探す（1ステップサイト用）
    const submitButtonSelectors = [
        "button[type='submit']:has-text('送信')",
        "button:has-text('送信する')",
        "button:has-text('送信')",
        "button:has-text('送る')",
        "input[type='submit'][value*='送信']",
        "input[type='button'][value*='送信']",
        "button:has-text('Submit')",
        "button:has-text('Send')",
        "input[type='submit'][value*='Submit']",
        "input[type='submit'][value*='Send']",
    ];
    // ステップ2: 見つからなければ「確認」ボタンを探す（2ステップサイト用）
    const confirmButtonSelectors = [
        "button[type='submit']", // 汎用的なsubmitボタン
        "input[type='submit']",
        "button:has-text('確認画面へ')",
        "button:has-text('確認する')",
        "button:has-text('確認')",
        "button:has-text('進む')",
        "button:has-text('次へ')",
        "input[value*='確認']",
        "input[value*='進む']",
        "button:has-text('Confirm')",
        "input[type='button'][value*='確認']",
        "button[onclick*='submit']",
        "input[type='button'][onclick*='submit']",
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
        ".btnArea button",
        ".button-area button",
        "p button[type='submit']",
        "div button[type='submit']",
    ];
    log(`🔍 Step1: Searching for direct submit button...`);
    console.log(`🔍 [submitForm] Step1: 送信ボタン検索開始`);
    // まず「送信」ボタンを探す
    let foundButton = null;
    let foundSelector = "";
    let isConfirmButton = false;
    for (const sel of submitButtonSelectors) {
        try {
            const btn = page.locator(sel).first();
            const count = await btn.count();
            if (count > 0) {
                foundButton = btn;
                foundSelector = sel;
                log(`✓ Found direct submit button: ${sel}`);
                console.log(`✓ [submitForm] 送信ボタン発見: ${sel}`);
                break;
            }
        }
        catch (e) {
            log(`⚠️ Error checking selector ${sel}: ${e}`);
        }
    }
    // 見つからなければ「確認」ボタンを探す
    if (!foundButton) {
        log(`🔍 Step2: Submit button not found, searching for confirm button...`);
        console.log(`🔍 [submitForm] Step2: 確認ボタン検索開始`);
        for (const sel of confirmButtonSelectors) {
            try {
                const btn = page.locator(sel).first();
                const count = await btn.count();
                if (count > 0) {
                    foundButton = btn;
                    foundSelector = sel;
                    isConfirmButton = true;
                    log(`✓ Found confirm button: ${sel}`);
                    console.log(`✓ [submitForm] 確認ボタン発見: ${sel}`);
                    break;
                }
            }
            catch (e) {
                log(`⚠️ Error checking selector ${sel}: ${e}`);
            }
        }
    }
    log(`🔍 [submitForm] ボタン検索結果: foundButton=${!!foundButton}, isConfirmButton=${isConfirmButton}`);
    console.log(`🔍 [submitForm] ボタン検索結果: foundButton=${!!foundButton}, isConfirmButton=${isConfirmButton}`);
    if (foundButton) {
        log(`🎯 [submitForm] ボタンが見つかったのでクリック処理開始...`);
        console.log(`🎯 [submitForm] ボタンが見つかったのでクリック処理開始...`);
        const btn = foundButton;
        try {
            // disabled属性を一時的に削除してクリックを試みる
            log(`🔍 [submitForm] disabled状態を確認中...`);
            const isDisabled = await btn.isDisabled().catch(() => false);
            log(`🔍 [submitForm] disabled=${isDisabled}`);
            if (isDisabled) {
                log(`⚠️ Button is disabled, attempting to enable...`);
                await btn
                    .evaluate((el) => {
                    if (el instanceof HTMLInputElement ||
                        el instanceof HTMLButtonElement) {
                        el.disabled = false;
                    }
                })
                    .catch(() => { });
            }
            const urlBefore = page.url();
            log(`📍 Current URL before click: ${urlBefore}`);
            // ボタンをクリック（force: true でラベルに覆われていてもクリック可能）
            if (isConfirmButton) {
                log(`🖱️ Clicking confirm button...`);
            }
            else {
                log(`🖱️ Clicking submit button...`);
            }
            await Promise.all([
                page
                    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 5000 })
                    .catch(() => { }),
                btn.click({ timeout: 3000, force: true }).catch(() => { }),
            ]);
            log(`✅ Button clicked successfully`);
            // クリック後に短時間待機（Ajax処理やDOM更新のため）
            await page.waitForTimeout(1000);
            const urlAfter = page.url();
            log(`📍 URL after click: ${urlAfter}`);
            // クリック後にバリデーションエラーをチェック
            if (urlAfter === urlBefore) {
                const postClickErrors = await checkValidationErrors(page, log);
                if (postClickErrors.length > 0) {
                    log(`❌ Validation errors after button click (${postClickErrors.length}): ${postClickErrors.slice(0, 3).join("; ")}`);
                    log(`⚠️ Form submission blocked by validation. Required fields may be missing.`);
                    return false; // バリデーションエラーで送信失敗
                }
            }
            // 確認ボタンをクリックした場合、または URL が変わった場合は確認画面をチェック
            if (isConfirmButton || urlAfter !== urlBefore) {
                log(`🔍 Step3: Checking if this is a confirmation page...`);
                // 確認画面の判定（ページ内容とボタンで判定）
                const pageText = (await page
                    .locator("body")
                    .textContent()
                    .catch(() => "")) || "";
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
                const isConfirmationPage = confirmationKeywords.some((kw) => pageText.includes(kw));
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
                // 「戻る」「修正」「キャンセル」ボタンを除外するキーワード
                const backButtonKeywords = [
                    "戻る",
                    "もどる",
                    "修正",
                    "訂正",
                    "キャンセル",
                    "やり直し",
                    "Back",
                    "Cancel",
                    "Edit",
                    "Modify",
                ];
                let finalBtn = null;
                for (const confirmSel of confirmationSelectors) {
                    const candidates = page.locator(confirmSel);
                    const count = await candidates.count();
                    // 各候補をチェック
                    for (let i = 0; i < count; i++) {
                        const candidate = candidates.nth(i);
                        const btnText = (await candidate.textContent().catch(() => "")) || "";
                        const btnValue = (await candidate.getAttribute("value").catch(() => "")) || "";
                        const combinedText = `${btnText} ${btnValue}`.toLowerCase();
                        // 「戻る」系のキーワードが含まれていないかチェック
                        const isBackButton = backButtonKeywords.some((kw) => combinedText.includes(kw.toLowerCase()));
                        if (!isBackButton) {
                            finalBtn = candidate;
                            log(`✓ Found final submit button (not back button): ${confirmSel}, text="${btnText}"`);
                            break;
                        }
                        else {
                            log(`⚠️ Skipping back button: text="${btnText}"`);
                        }
                    }
                    if (finalBtn)
                        break;
                }
                if (finalBtn) {
                    log(`🖱️ Step4: Clicking final submit button on confirmation page...`);
                    const urlBeforeFinal = page.url();
                    await Promise.all([
                        page
                            .waitForNavigation({
                            waitUntil: "domcontentloaded",
                            timeout: 5000,
                        })
                            .catch(() => { }),
                        finalBtn.click({ timeout: 3000, force: true }).catch(() => { }),
                    ]);
                    log(`✅ Final submit button clicked successfully`);
                    await page.waitForTimeout(1000);
                    // 最終送信後のチェック
                    log(`🔍 Step5: Verifying submission success...`);
                    return await verifySubmissionSuccess(page, urlBeforeFinal, dialogState.detected, dialogState.message, log);
                }
                else {
                    log(`❌ Could not find final submit button on confirmation page`);
                    return false;
                }
            }
            else {
                // 直接送信ボタンをクリックした場合（1ステップサイト）
                log(`✅ Direct submit button clicked (1-step flow)`);
                log(`🔍 Verifying submission success...`);
                return await verifySubmissionSuccess(page, urlBefore, dialogState.detected, dialogState.message, log);
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log(`❌ [submitForm] Error during button click: ${msg}`);
            console.error(`❌ [submitForm] Error during button click: ${msg}`);
            return false;
        }
    }
    else {
        log("❌ No submit or confirm button found on this page");
        return false;
    }
    log("❌ Button click failed or form submission did not complete");
    return false;
}
// 送信成功の厳密な検証（高速化版）
async function verifySubmissionSuccess(page, urlBefore, dialogDetected, dialogMessage, log) {
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
        const hasSuccessKeyword = successKeywords.some((keyword) => messageLower.includes(keyword.toLowerCase()));
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
        const hasErrorKeyword = errorKeywords.some((keyword) => messageLower.includes(keyword.toLowerCase()));
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
        const isThanksPage = thanksPatterns.some((pattern) => urlLower.includes(pattern));
        if (isThanksPage) {
            log(`✅ Thanks page pattern detected in URL`);
            return true;
        }
        // URLが変化したが明確な成功表示なし = 推定成功
        log(`⚠️ URL changed but no clear success indicator. Assuming success.`);
        return true;
    }
    // 5. 総合判定：成功の証拠なし = 失敗
    log(`❌ No success indicators found. Submission failed (validation error or missing required fields).`);
    return false;
}
async function locateFirst(page, scope, selectors) {
    for (const sel of selectors) {
        const loc = scope.locator(sel).first();
        if ((await loc.count()) > 0) {
            // fill()できない要素タイプはスキップ（radio, checkbox, hidden）
            const inputType = await loc.getAttribute("type");
            if (inputType === "radio" ||
                inputType === "checkbox" ||
                inputType === "hidden") {
                continue;
            }
            return loc;
        }
    }
    return null;
}
async function findAndFillFormAnyContext(page, payload, log) {
    const mainResult = await findAndFillForm(page, payload, log);
    if (mainResult === "blocked")
        return "blocked";
    if (mainResult === true)
        return true;
    for (const frame of page.frames()) {
        if (frame === page.mainFrame())
            continue;
        const frameResult = await findAndFillForm(frame, payload, log);
        if (frameResult === "blocked")
            return "blocked";
        if (frameResult === true)
            return true;
    }
    return false;
}
async function submitFormAnyContext(page, log) {
    log(`🚀 [submitFormAnyContext] 開始`);
    console.log(`🚀 [submitFormAnyContext] 開始`);
    // alert/confirm/promptダイアログの監視（Page レベルで設定）
    const dialogState = { detected: false, message: "" };
    const dialogHandler = async (dialog) => {
        dialogState.message = dialog.message();
        dialogState.detected = true;
        log(`Dialog detected: ${dialog.type()} - "${dialogState.message}"`);
        await dialog.accept(); // 自動で閉じる
    };
    page.on("dialog", dialogHandler);
    try {
        log(`🔍 [submitFormAnyContext] submitForm(mainPage) を呼び出し中...`);
        console.log(`🔍 [submitFormAnyContext] submitForm(mainPage) を呼び出し中...`);
        if (await submitForm(page, log, dialogState)) {
            log(`✅ [submitFormAnyContext] submitForm(mainPage) 成功`);
            return true;
        }
        log(`⚠️ [submitFormAnyContext] submitForm(mainPage) 失敗、フレームを試行...`);
        const frames = page.frames();
        log(`🔍 [submitFormAnyContext] フレーム数: ${frames.length}`);
        for (const frame of frames) {
            if (frame === page.mainFrame())
                continue;
            log(`🔍 [submitFormAnyContext] submitForm(frame) を呼び出し中...`);
            if (await submitForm(frame, log, dialogState)) {
                log(`✅ [submitFormAnyContext] submitForm(frame) 成功`);
                return true;
            }
        }
        log(`❌ [submitFormAnyContext] 全ての試行が失敗`);
        return false;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`⚠️ submitFormAnyContext error: ${msg}`);
        console.error(`❌ [submitFormAnyContext] Error: ${msg}`);
        return false;
    }
    finally {
        // イベントリスナーをクリーンアップ
        page.off("dialog", dialogHandler);
    }
}
// ひらがな → カタカナ変換
function hiraganaToKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, (match) => String.fromCharCode(match.charCodeAt(0) + 0x60));
}
// カタカナ → ひらがな変換
function katakanaToHiragana(str) {
    return str.replace(/[\u30a1-\u30f6]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0x60));
}
// 文字列がひらがなを含むかチェック
function containsHiragana(str) {
    return /[\u3041-\u3096]/.test(str);
}
// 文字列がカタカナを含むかチェック
function containsKatakana(str) {
    return /[\u30a1-\u30f6]/.test(str);
}
async function analyzeFuriganaField(page, field, log) {
    try {
        // 1. フィールドのid/name属性を取得
        const fieldId = await field.getAttribute("id").catch(() => null);
        const fieldName = await field.getAttribute("name").catch(() => null);
        const placeholder = await field.getAttribute("placeholder").catch(() => "") || "";
        const ariaLabel = await field.getAttribute("aria-label").catch(() => "") || "";
        // 2. ラベルテキストを取得
        let labelText = "";
        if (fieldId) {
            const label = page.locator(`label[for="${fieldId}"]`).first();
            if ((await label.count()) > 0) {
                labelText = (await label.textContent()) || "";
            }
        }
        // 3. すべてのテキストを結合して判定
        const allText = `${labelText} ${placeholder} ${ariaLabel} ${fieldName || ""} ${fieldId || ""}`;
        log(`  [analyzeFuriganaField] allText="${allText.trim()}"`);
        // 4. ひらがな/カタカナ判定
        let format = "unknown";
        if (/フリガナ|カナ|カタカナ|ヨミガナ|セイ|メイ|ミョウジ|ナマエ/.test(allText)) {
            format = "katakana";
        }
        else if (/ふりがな|かな|よみがな|せい|めい|みょうじ|なまえ/.test(allText)) {
            format = "hiragana";
        }
        // 5. 姓名分離判定
        let type = "unknown";
        if (/姓|苗字|せい|セイ|みょうじ|ミョウジ|last.*name|lastname/i.test(allText)) {
            type = "lastName";
        }
        else if (/名(?!前)|めい|メイ|なまえ|ナマエ|first.*name|firstname/i.test(allText)) {
            type = "firstName";
        }
        else {
            type = "fullName";
        }
        log(`  [analyzeFuriganaField] Result: format=${format}, type=${type}`);
        return { format, type };
    }
    catch (err) {
        log(`  [analyzeFuriganaField] Error: ${err}`);
        return { format: "unknown", type: "unknown" };
    }
}
async function fillByLabel(page, scope, rules, log, payload) {
    for (const rule of rules) {
        if (!rule.value)
            continue;
        // ふりがなキーワードかチェック
        const isFuriganaField = rule.keywords.some((kw) => /ふりがな|フリガナ|カナ|かな|カタカナ|よみがな|ヨミガナ|Furigana|Kana|せい|セイ|めい|メイ|みょうじ|ミョウジ|なまえ|ナマエ/i.test(kw));
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
                        if (inputType === "radio" ||
                            inputType === "checkbox" ||
                            inputType === "hidden") {
                            continue;
                        }
                        // ふりがなフィールドの場合、DOM解析で事前に適切な値を決定
                        let valueToFill = rule.value;
                        if (isFuriganaField && payload) {
                            const spec = await analyzeFuriganaField(page, target, log);
                            // 姓名タイプに基づいて値を選択
                            if (spec.type === "lastName" && payload.lastNameKana) {
                                valueToFill = payload.lastNameKana;
                            }
                            else if (spec.type === "firstName" && payload.firstNameKana) {
                                valueToFill = payload.firstNameKana;
                            }
                            else if (payload.fullNameKana) {
                                valueToFill = payload.fullNameKana;
                            }
                            // フォーマットに基づいて変換
                            if (spec.format === "katakana" && containsHiragana(valueToFill)) {
                                valueToFill = hiraganaToKatakana(valueToFill);
                                log(`  → 変換: ひらがな→カタカナ: "${valueToFill}"`);
                            }
                            else if (spec.format === "hiragana" && containsKatakana(valueToFill)) {
                                valueToFill = katakanaToHiragana(valueToFill);
                                log(`  → 変換: カタカナ→ひらがな: "${valueToFill}"`);
                            }
                        }
                        // 値を入力
                        await target.fill(valueToFill, { timeout: 3000 }).catch(() => { });
                        log(`Filled via label(${kw}) -> #${forId}: "${valueToFill}"`);
                        // ふりがなフィールドの場合、バリデーションエラーをチェックしてフォールバック
                        if (isFuriganaField) {
                            await page.waitForTimeout(300); // バリデーション処理を待つ
                            const isInvalid = await target.evaluate((el) => {
                                if (el instanceof HTMLInputElement) {
                                    return !el.validity.valid || el.classList.contains('error') || el.classList.contains('invalid');
                                }
                                return false;
                            }).catch(() => false);
                            if (isInvalid) {
                                // ひらがな→カタカナ、カタカナ→ひらがなで再試行
                                let altValue = valueToFill;
                                if (containsHiragana(valueToFill)) {
                                    altValue = hiraganaToKatakana(valueToFill);
                                    log(`⚠️ Validation error detected, retrying with katakana: "${altValue}"`);
                                }
                                else if (containsKatakana(valueToFill)) {
                                    altValue = katakanaToHiragana(valueToFill);
                                    log(`⚠️ Validation error detected, retrying with hiragana: "${altValue}"`);
                                }
                                if (altValue !== valueToFill) {
                                    await target.fill(altValue, { timeout: 3000 }).catch(() => { });
                                    log(`Retried with alternative kana: "${altValue}"`);
                                }
                            }
                        }
                        break;
                    }
                }
                else {
                    const target = label.locator("input,textarea");
                    if ((await target.count()) > 0) {
                        const firstTarget = target.first();
                        // ふりがなフィールドの場合、DOM解析で事前に適切な値を決定
                        let valueToFill = rule.value;
                        if (isFuriganaField && payload) {
                            const spec = await analyzeFuriganaField(page, firstTarget, log);
                            // 姓名タイプに基づいて値を選択
                            if (spec.type === "lastName" && payload.lastNameKana) {
                                valueToFill = payload.lastNameKana;
                            }
                            else if (spec.type === "firstName" && payload.firstNameKana) {
                                valueToFill = payload.firstNameKana;
                            }
                            else if (payload.fullNameKana) {
                                valueToFill = payload.fullNameKana;
                            }
                            // フォーマットに基づいて変換
                            if (spec.format === "katakana" && containsHiragana(valueToFill)) {
                                valueToFill = hiraganaToKatakana(valueToFill);
                                log(`  → 変換: ひらがな→カタカナ: "${valueToFill}"`);
                            }
                            else if (spec.format === "hiragana" && containsKatakana(valueToFill)) {
                                valueToFill = katakanaToHiragana(valueToFill);
                                log(`  → 変換: カタカナ→ひらがな: "${valueToFill}"`);
                            }
                        }
                        await firstTarget.fill(valueToFill).catch(() => { });
                        log(`Filled via nested label(${kw}): "${valueToFill}"`);
                        // ふりがなフィールドのフォールバック
                        if (isFuriganaField) {
                            await page.waitForTimeout(300);
                            const isInvalid = await firstTarget.evaluate((el) => {
                                if (el instanceof HTMLInputElement) {
                                    return !el.validity.valid || el.classList.contains('error') || el.classList.contains('invalid');
                                }
                                return false;
                            }).catch(() => false);
                            if (isInvalid) {
                                let altValue = valueToFill;
                                if (containsHiragana(valueToFill)) {
                                    altValue = hiraganaToKatakana(valueToFill);
                                    log(`⚠️ Validation error detected, retrying with katakana: "${altValue}"`);
                                }
                                else if (containsKatakana(valueToFill)) {
                                    altValue = katakanaToHiragana(valueToFill);
                                    log(`⚠️ Validation error detected, retrying with hiragana: "${altValue}"`);
                                }
                                if (altValue !== valueToFill) {
                                    await firstTarget.fill(altValue, { timeout: 3000 }).catch(() => { });
                                    log(`Retried with alternative kana: "${altValue}"`);
                                }
                            }
                        }
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
    const { jobId, companyId, items, leadIds, debug } = req.body;
    console.log(`[batch-async] Request body: jobId=${jobId}, companyId=${companyId}, items=${items?.length}, leadIds=${leadIds?.length}`);
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
    // バックグラウンドで処理を実行（キューに積んで同時実行数を制限）
    asyncJobQueue.push({
        jobId,
        companyId,
        addedAt: new Date(),
        run: async () => {
            let browser = null;
            // ログバッファをクリア（新しいバッチ処理で上書き）
            batchLogBuffer = [];
            appendToBatchLog("\n" + "=".repeat(80));
            appendToBatchLog(`🚀 バッチ処理開始`);
            appendToBatchLog(`   Job ID: ${jobId}`);
            appendToBatchLog(`   Company ID: ${companyId}`);
            appendToBatchLog(`   Total Items: ${items.length}`);
            appendToBatchLog(`   Started At: ${new Date().toISOString()}`);
            appendToBatchLog("=".repeat(80) + "\n");
            try {
                console.log(`[batch-async] Starting job ${jobId} with ${items.length} items`);
                // ジョブステータスを "running" に更新
                await supabase.from("batch_jobs")
                    .update({
                    status: "running",
                    started_at: new Date().toISOString(),
                })
                    .eq("id", jobId);
                // ブラウザ再起動のヘルパー関数
                const launchBrowser = async () => {
                    const maxRetries = 3;
                    for (let attempt = 1; attempt <= maxRetries; attempt++) {
                        try {
                            console.log(`[batch-async] Launching browser (attempt ${attempt}/${maxRetries})...`);
                            const newBrowser = await chromium.launch({
                                headless: false, // 一時的にブラウザを開いて動作確認
                                slowMo: 200, // 処理を見やすくするためスロー再生
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
                            console.log(`[batch-async] Browser launched successfully`);
                            return newBrowser;
                        }
                        catch (launchError) {
                            const msg = launchError instanceof Error
                                ? launchError.message
                                : String(launchError);
                            console.error(`[batch-async] Browser launch failed (attempt ${attempt}): ${msg}`);
                            if (attempt < maxRetries) {
                                const waitTime = Math.pow(2, attempt) * 1000;
                                console.log(`[batch-async] Waiting ${waitTime}ms before retry...`);
                                await new Promise((resolve) => setTimeout(resolve, waitTime));
                            }
                            else {
                                throw new Error(`Browser launch failed after ${maxRetries} attempts: ${msg}`);
                            }
                        }
                    }
                    throw new Error("Browser launch failed");
                };
                // 初回のブラウザ起動
                appendToBatchLog(`🌐 初回ブラウザ起動中...`);
                browser = await launchBrowser();
                appendToBatchLog(`✅ ブラウザ起動成功\n`);
                const results = [];
                let completedCount = 0;
                let failedCount = 0;
                // ブラウザ再起動の閾値（10件ごとに予防的に再起動）
                const BROWSER_RESTART_THRESHOLD = 10;
                let processedSinceLastRestart = 0;
                // 各アイテムを順次処理
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const leadId = leadIds[i];
                    appendToBatchLog("\n" + "━".repeat(80));
                    appendToBatchLog(`📋 [${i + 1}/${items.length}] 処理開始`);
                    appendToBatchLog(`   URL: ${item.url}`);
                    appendToBatchLog(`   Company: ${item.company}`);
                    appendToBatchLog(`   Lead ID: ${leadId}`);
                    appendToBatchLog("━".repeat(80) + "\n");
                    console.log(`[batch-async] [${i + 1}/${items.length}] Processing ${item.url} (leadId: ${leadId})`);
                    try {
                        // 定期的な予防再起動（10件ごと）
                        if (processedSinceLastRestart >= BROWSER_RESTART_THRESHOLD && i > 0) {
                            appendToBatchLog(`⚡ 予防的ブラウザ再起動（${processedSinceLastRestart}件処理後）`);
                            console.log(`[batch-async] ⚡ Proactive browser restart after ${processedSinceLastRestart} items (prevent memory leak)`);
                            // 確実にブラウザをクローズ（キャッシュ・コンテキストを完全クリア）
                            if (browser) {
                                try {
                                    await browser.close();
                                    appendToBatchLog(`✓ 旧ブラウザクローズ成功`);
                                    console.log(`[batch-async] ✓ Old browser closed successfully`);
                                }
                                catch (closeError) {
                                    appendToBatchLog(`⚠️ 旧ブラウザクローズ失敗: ${closeError}`);
                                    console.warn(`[batch-async] ⚠️ Browser close warning: ${closeError}`);
                                    // closeに失敗しても続行（既に閉じている可能性）
                                }
                            }
                            browser = await launchBrowser();
                            appendToBatchLog(`✓ 新ブラウザ起動成功`);
                            processedSinceLastRestart = 0;
                        }
                        // ブラウザが閉じられていないか確認（クラッシュ検出）
                        let isBrowserAlive = false;
                        try {
                            isBrowserAlive = browser?.isConnected() ?? false;
                            console.log(`🔍 [DEBUG] Browser alive check: ${isBrowserAlive}`);
                        }
                        catch (checkError) {
                            console.warn(`[batch-async] Browser connection check failed: ${checkError}`);
                            isBrowserAlive = false;
                        }
                        if (!isBrowserAlive) {
                            appendToBatchLog(`⚠️ ブラウザクラッシュ検出、再起動中...`);
                            console.warn(`[batch-async] ⚠️ Browser crashed, restarting...`);
                            // 古いブラウザを確実にクローズ（キャッシュ・コンテキストを完全クリア）
                            if (browser) {
                                try {
                                    await browser.close();
                                    appendToBatchLog(`✓ クラッシュしたブラウザインスタンスをクローズ`);
                                    console.log(`[batch-async] ✓ Crashed browser closed successfully`);
                                }
                                catch (closeError) {
                                    appendToBatchLog(`⚠️ クラッシュブラウザクローズ失敗: ${closeError}`);
                                    console.log(`[batch-async] Old browser already closed (expected for crash)`);
                                    // クラッシュ時は既に閉じている可能性が高いので警告のみ
                                }
                            }
                            // 新しいブラウザを起動（完全にクリーンな状態）
                            browser = await launchBrowser();
                            appendToBatchLog(`✓ ブラウザ再起動成功`);
                            processedSinceLastRestart = 0;
                        }
                        // 1件ごとの処理（新しいコンテキストで実行）
                        // 全体タイムアウト（300秒 = 5分）を設定して、ハングを防ぐ
                        console.log(`⏱️ [DEBUG] Starting processing with 300s timeout...`);
                        const result = await Promise.race([
                            autoSubmitWithBrowser(browser, item),
                            new Promise((_, reject) => setTimeout(() => {
                                console.error(`❌ [DEBUG] Item processing timeout (300s) for ${item.url}`);
                                reject(new Error(`Processing timeout after 300 seconds for ${item.url}`));
                            }, 300000)),
                        ]).catch((err) => {
                            console.error(`❌ [DEBUG] Processing failed: ${err}`);
                            return {
                                success: false,
                                logs: [`Processing error: ${err}`],
                                finalUrl: item.url,
                                note: `Timeout or error: ${err instanceof Error ? err.message : String(err)}`,
                            };
                        });
                        if (result.success) {
                            completedCount++;
                            results.push({ leadId, url: item.url, success: true });
                            appendToBatchLog(`\n✅ [${i + 1}/${items.length}] 送信成功: ${item.company}`);
                            // リードのステータスを "success" に更新
                            await supabase.from("lead_lists")
                                .update({ send_status: "success" })
                                .eq("id", leadId);
                        }
                        else {
                            failedCount++;
                            results.push({
                                leadId,
                                url: item.url,
                                success: false,
                                error: result.note || "Unknown error",
                            });
                            appendToBatchLog(`\n❌ [${i + 1}/${items.length}] 送信失敗: ${item.company}`);
                            appendToBatchLog(`   理由: ${result.note || "Unknown error"}`);
                            // リードのステータスを "failed" に更新
                            await supabase.from("lead_lists")
                                .update({ send_status: "failed" })
                                .eq("id", leadId);
                        }
                        // 進捗をDBに更新
                        await supabase.from("batch_jobs")
                            .update({
                            completed_items: completedCount,
                            failed_items: failedCount,
                            results: results,
                        })
                            .eq("id", jobId);
                        appendToBatchLog(`📊 進捗: ${i + 1}/${items.length}件完了（成功 ${completedCount} / 失敗 ${failedCount}）\n`);
                        console.log(`[batch-async] [${i + 1}/${items.length}] ${item.url} - success=${result.success}`);
                        // 処理カウンターを増やす
                        processedSinceLastRestart++;
                    }
                    catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        console.error(`[batch-async] [${i + 1}/${items.length}] Error: ${message}`);
                        // ブラウザクラッシュエラーの場合は記録してブラウザを再起動
                        if (message.includes("browser has been closed") ||
                            message.includes("Target closed") ||
                            message.includes("Session closed")) {
                            console.warn(`[batch-async] Browser crash detected, will restart on next item`);
                            // 次のループでブラウザが再起動される
                        }
                        appendToBatchLog(`\n❌ [${i + 1}/${items.length}] エラー発生: ${message}\n`);
                        failedCount++;
                        results.push({
                            leadId,
                            url: item.url,
                            success: false,
                            error: message,
                        });
                        // リードのステータスを "failed" に更新
                        await supabase.from("lead_lists")
                            .update({ send_status: "failed" })
                            .eq("id", leadId);
                        // 進捗をDBに更新
                        await supabase.from("batch_jobs")
                            .update({
                            completed_items: completedCount,
                            failed_items: failedCount,
                            results: results,
                        })
                            .eq("id", jobId);
                        appendToBatchLog(`📊 進捗: ${i + 1}/${items.length}件完了（成功 ${completedCount} / 失敗 ${failedCount}）\n`);
                        // エラー時も処理カウンターを増やす
                        processedSinceLastRestart++;
                    }
                }
                // ジョブステータスを "completed" に更新
                await supabase.from("batch_jobs")
                    .update({
                    status: "completed",
                    completed_at: new Date().toISOString(),
                })
                    .eq("id", jobId);
                appendToBatchLog("\n" + "=".repeat(80));
                appendToBatchLog(`🎉 バッチ処理完了`);
                appendToBatchLog(`   成功: ${completedCount}件`);
                appendToBatchLog(`   失敗: ${failedCount}件`);
                appendToBatchLog(`   成功率: ${((completedCount / items.length) * 100).toFixed(1)}%`);
                appendToBatchLog(`   完了時刻: ${new Date().toISOString()}`);
                appendToBatchLog("=".repeat(80) + "\n");
                console.log(`[batch-async] Job ${jobId} completed: ${completedCount} success, ${failedCount} failed`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                appendToBatchLog(`\n❌ バッチ処理全体でエラー発生: ${message}\n`);
                console.error(`[batch-async] Job ${jobId} failed: ${message}`);
                // ジョブステータスを "failed" に更新
                await supabase.from("batch_jobs")
                    .update({
                    status: "failed",
                    error_message: message,
                    completed_at: new Date().toISOString(),
                })
                    .eq("id", jobId);
            }
            finally {
                // 失敗時も含めて必ずブラウザを閉じる（キャッシュ・コンテキストを完全クリア）
                if (browser) {
                    try {
                        await browser.close();
                        appendToBatchLog(`✅ 最終ブラウザクローズ成功\n`);
                        console.log(`[batch-async] ✓ Final browser cleanup completed`);
                    }
                    catch (closeError) {
                        appendToBatchLog(`❌ 最終ブラウザクローズ失敗: ${closeError}\n`);
                        console.error(`[batch-async] Failed to close browser: ${closeError}`);
                        // エラーでも処理は完了とする
                    }
                }
                // ログをファイルに書き込み（上書きモード）
                writeBatchLogToFile();
            }
        },
    });
    console.log(`[batch-async/queue] Enqueued job ${jobId} (companyId=${companyId}). Queue size: ${asyncJobQueue.length}, active=${currentAsyncJobCount}/${MAX_CONCURRENT_ASYNC_JOBS}`);
    processAsyncJobQueue();
});
// サーバー起動
app.listen(PORT, () => {
    console.log(`🚀 Auto-submit server running on port ${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
    console.log(`   Auto-submit:  POST http://localhost:${PORT}/auto-submit`);
});
