import express from "express";
import cors from "cors";
import { chromium } from "playwright";
const app = express();
const PORT = process.env.PORT || 3001;
// CORS設定（Vercelからのリクエストを許可）
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || [
        "http://localhost:3000",
    ],
    methods: ["POST", "OPTIONS"],
    credentials: true,
}));
// ペイロードサイズ制限を50MBに拡張（100件バッチ処理対応）
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
// ヘルスチェック
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
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
// バッチ送信エンドポイント（複数URL連続処理、SSEでストリーミング）
app.post("/auto-submit/batch", async (req, res) => {
    const { items, debug } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            error: "items array is required",
        });
    }
    // SSE設定
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    let browser = null;
    try {
        // 1つのブラウザインスタンスを起動
        browser = await chromium.launch({
            headless: !debug,
            slowMo: debug ? 200 : 0,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        });
        res.write(`data: ${JSON.stringify({ type: "browser_ready" })}\n\n`);
        // 各アイテムを順次処理
        for (let i = 0; i < items.length; i++) {
            const payload = items[i];
            const itemId = payload.url;
            // 処理開始を通知
            res.write(`data: ${JSON.stringify({
                type: "item_start",
                index: i,
                url: payload.url,
            })}\n\n`);
            try {
                const result = await autoSubmitWithBrowser(browser, payload);
                // ローカルログ出力
                console.log(`[auto-submit/batch] ${i + 1}/${items.length} ${payload.url} - success=${result.success}`);
                if (!result.success) {
                    console.log(`[auto-submit/batch] Failure reason: ${result.note || "Unknown"}`);
                    console.log(`[auto-submit/batch] Logs:\n${result.logs.join("\n")}`);
                }
                // 処理完了を通知
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
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                res.write(`data: ${JSON.stringify({
                    type: "item_error",
                    index: i,
                    url: payload.url,
                    error: message,
                })}\n\n`);
                console.error(`[auto-submit/batch] Error ${i + 1}/${items.length}: ${message}`);
            }
        }
        // 全完了を通知
        res.write(`data: ${JSON.stringify({ type: "batch_complete", total: items.length })}\n\n`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[auto-submit/batch] Fatal error: ${message}`);
        res.write(`data: ${JSON.stringify({ type: "fatal_error", error: message })}\n\n`);
    }
    finally {
        if (browser) {
            await browser.close();
        }
        res.end();
    }
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
    log(`=== autoSubmit START ===`);
    log(`Payload: url=${payload.url}, company=${payload.company}`);
    let page = null;
    try {
        log(`Creating new page`);
        const context = await browser.newContext();
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
        }
        catch (navError) {
            const msg = navError instanceof Error ? navError.message : String(navError);
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
        log(`Finding contact page link`);
        const contactUrl = await findContactPage(page, log);
        if (contactUrl && contactUrl !== page.url()) {
            log(`Found contact page, navigating to: ${contactUrl}`);
            try {
                await page.goto(contactUrl, {
                    waitUntil: "domcontentloaded",
                    timeout: 30000,
                });
                log(`Contact page navigation completed`);
            }
            catch (contactNavError) {
                const msg = contactNavError instanceof Error
                    ? contactNavError.message
                    : String(contactNavError);
                log(`Contact page navigation FAILED - ${msg}`);
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
        else {
            log(`No separate contact page found, using current page`);
        }
        // Try to locate a form and fill
        log(`Finding and filling form`);
        const found = await findAndFillFormAnyContext(page, payload, log);
        if (found === "blocked") {
            log(`Form is protected by CAPTCHA`);
            return {
                success: false,
                logs,
                finalUrl: page.url(),
                note: "CAPTCHA detected",
            };
        }
        if (!found) {
            log(`No suitable contact form found`);
            return {
                success: false,
                logs,
                finalUrl: page.url(),
                note: "Form not found",
            };
        }
        log(`Form found and filled`);
        // Try submit
        log(`Submitting form`);
        const submitted = await submitFormAnyContext(page, log);
        log(submitted ? `Form submitted successfully` : `Form submission FAILED`);
        const finalUrl = page.url();
        log(`=== autoSubmit END === success=${submitted}, finalUrl=${finalUrl}`);
        // ページを閉じる（ブラウザは維持）
        await page.close().catch(() => { });
        return { success: submitted, logs, finalUrl };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
        log(`UNEXPECTED ERROR: ${message}`);
        if (page)
            await page.close().catch(() => { });
        return { success: false, logs, finalUrl: page?.url(), note: message };
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
        const context = await browser.newContext();
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
        log(`Closing browser`);
        if (browser)
            await browser.close();
    }
}
function sanitizeUrl(url) {
    if (!/^https?:\/\//i.test(url))
        return `https://${url}`;
    return url;
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
        "/inquiry",
        "/inquiries",
        "/support",
        "/toiawase",
        "/company/contact",
        "/info/contact",
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
        "form:has(input), form:has(textarea)",
    ];
    let formFound = null;
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
    if (!formFound)
        return false;
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
            value: payload.postalCode || "100-0001",
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
            value: payload.city || "千代田区",
            selectors: [
                "input[name*='city']",
                "input[name*='shiku']",
                "input[id*='city']",
                "input[id*='shiku']",
                "input[placeholder*='市区町村']",
            ],
        },
        {
            value: payload.address || "千代田1-1",
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
        if (!value)
            continue;
        const found = await locateFirst(page, formFound, selectors);
        if (found) {
            await found.fill(value);
            log(`Filled field via ${selectors[0]}`);
        }
    }
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
            value: payload.postalCode || "100-0001",
        },
        {
            keywords: ["市区町村", "市町村", "City"],
            value: payload.city || "千代田区",
        },
        {
            keywords: ["住所", "番地", "Address", "Street"],
            value: payload.address || "千代田1-1",
        },
        {
            keywords: ["建物", "ビル", "Building"],
            value: payload.building || "",
        },
    ], log);
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
                if (value !== "" &&
                    !text.includes("選択") &&
                    !text.includes("---") &&
                    !text.includes("未選択")) {
                    await select.selectOption({ index: j });
                    log(`Selected option index ${j} in select[${i}]`);
                    break;
                }
            }
        }
        catch {
            // 選択できない場合はスキップ
        }
    }
    // チェックボックス：必須または最初のものをチェック（タイムアウト3秒）
    const checkboxes = formFound.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
        const checkbox = checkboxes.nth(i);
        try {
            const isChecked = await checkbox.isChecked({ timeout: 3000 });
            if (!isChecked) {
                await checkbox.check({ timeout: 3000 });
                log(`Checked checkbox[${i}]`);
            }
        }
        catch {
            // チェックできない場合はスキップ
        }
    }
    // ラジオボタン：各グループの最初のものを選択（タイムアウト3秒）
    const radioGroups = new Set();
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
        }
        catch {
            // 選択できない場合はスキップ
        }
    }
    // 必須フィールドの最終チェック：未入力の必須フィールドにプレースホルダーベースで値を入力
    const requiredInputs = formFound.locator('input[required]:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"])');
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
                const fieldHint = `${inputName}${inputId}${placeholder}${ariaLabel}${title}`.toLowerCase();
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
                    defaultValue = payload.postalCode || "100-0001";
                    // 都道府県
                }
                else if (fieldHint.includes("pref") ||
                    fieldHint.includes("都道府県") ||
                    fieldHint.includes("todofuken")) {
                    defaultValue = payload.prefecture || "東京都";
                    // 市区町村
                }
                else if (fieldHint.includes("city") ||
                    fieldHint.includes("市区町村") ||
                    fieldHint.includes("shiku")) {
                    defaultValue = payload.city || "千代田区";
                    // 住所
                }
                else if (fieldHint.includes("address") ||
                    fieldHint.includes("street") ||
                    fieldHint.includes("住所") ||
                    fieldHint.includes("番地")) {
                    defaultValue = payload.address || "千代田1-1";
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
    // 必須テキストエリアのチェック
    const requiredTextareas = formFound.locator("textarea[required]");
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
            if (!hint)
                continue; // ヒントがなければスキップ
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
            if (valueToFill) {
                await input.fill(valueToFill, { timeout: 1000 });
                log(`Filled by hint [${hint}] with: ${valueToFill}`);
            }
        }
        catch {
            // 入力できない場合はスキップ
        }
    }
    // 必須セレクトのチェック
    const requiredSelects = formFound.locator("select[required]");
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
    return true;
}
async function submitForm(page, log, dialogState) {
    const buttonSelectors = [
        "form button[type='submit']",
        "form input[type='submit']",
        "button:has-text('送信')",
        "button:has-text('確認')",
        "button:has-text('Submit')",
        "input[type='submit']",
    ];
    for (const sel of buttonSelectors) {
        const btn = page.locator(sel).first();
        if ((await btn.count()) > 0) {
            try {
                const urlBefore = page.url();
                log(`Current URL before submit: ${urlBefore}`);
                // 送信ボタンをクリック
                await Promise.all([
                    page
                        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 5000 })
                        .catch(() => { }),
                    btn.click({ timeout: 3000 }).catch(() => { }),
                ]);
                log(`Clicked submit via ${sel}`);
                // クリック後に短時間待機（Ajax処理やDOM更新のため）
                await page.waitForTimeout(500);
                // 確認画面の判定（最終送信ボタンがあるか）
                const finalBtn = page
                    .locator("button:has-text('送信'), input[type='submit']")
                    .first();
                if ((await finalBtn.count()) > 0) {
                    log("Confirmation page detected, clicking final submit");
                    const urlBeforeFinal = page.url();
                    await Promise.all([
                        page
                            .waitForNavigation({
                            waitUntil: "domcontentloaded",
                            timeout: 5000,
                        })
                            .catch(() => { }),
                        finalBtn.click({ timeout: 3000 }).catch(() => { }),
                    ]);
                    log("Clicked final submit");
                    await page.waitForTimeout(500);
                    // 最終送信後のチェック
                    return await verifySubmissionSuccess(page, urlBeforeFinal, dialogState.detected, dialogState.message, log);
                }
                // 1回のクリックで完了の場合
                return await verifySubmissionSuccess(page, urlBefore, dialogState.detected, dialogState.message, log);
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                log(`Submit error: ${msg}`);
                // 次のセレクタを試す
            }
        }
    }
    log("No submit button found");
    return false;
}
// 送信成功の厳密な検証（高速化版）
async function verifySubmissionSuccess(page, urlBefore, dialogDetected, dialogMessage, log) {
    const urlAfter = page.url();
    const urlChanged = urlAfter !== urlBefore;
    log(`URL after submit: ${urlAfter} (changed: ${urlChanged})`);
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
    log(`Page text length: ${pageText.length} characters`);
    // 2. エラーキーワードチェック（優先）
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
    // 3. 成功キーワードチェック
    const successKeywords = [
        // 日本語
        "ありがとうございました",
        "ありがとうございます",
        "お問い合わせを受け付けました",
        "送信完了",
        "送信しました",
        "送信が完了",
        "受け付けました",
        "受付完了",
        "完了しました",
        "お問い合わせいただき",
        "送信いただき",
        // 英語
        "thank you",
        "thanks for",
        "successfully submitted",
        "message sent",
        "inquiry received",
        "request received",
        "submission successful",
        "form submitted",
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
        if (await submitForm(page, log, dialogState))
            return true;
        for (const frame of page.frames()) {
            if (frame === page.mainFrame())
                continue;
            if (await submitForm(frame, log, dialogState))
                return true;
        }
        return false;
    }
    finally {
        // イベントリスナーをクリーンアップ
        page.off("dialog", dialogHandler);
    }
}
async function fillByLabel(page, scope, rules, log) {
    for (const rule of rules) {
        if (!rule.value)
            continue;
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
                        await target.fill(rule.value, { timeout: 3000 }).catch(() => { });
                        log(`Filled via label(${kw}) -> #${forId}`);
                        break;
                    }
                }
                else {
                    const target = label.locator("input,textarea");
                    if ((await target.count()) > 0) {
                        await target
                            .first()
                            .fill(rule.value)
                            .catch(() => { });
                        log(`Filled via nested label(${kw})`);
                        break;
                    }
                }
            }
        }
    }
}
// サーバー起動
app.listen(PORT, () => {
    console.log(`🚀 Auto-submit server running on port ${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
    console.log(`   Auto-submit:  POST http://localhost:${PORT}/auto-submit`);
});
