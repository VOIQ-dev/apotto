import express from "express";
import cors from "cors";
import { chromium, Browser, Page, Frame } from "playwright";

const app = express();
const PORT = process.env.PORT || 3001;

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

app.use(express.json());

// ヘルスチェック
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

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

  console.log(`[auto-submit] Request received: url=${payload.url}`);

  if (!payload.url) {
    return res.status(400).json({
      success: false,
      logs: ["Missing required field: url"],
      note: "URL is required",
    });
  }

  try {
    const result = await autoSubmit(payload);
    console.log(`[auto-submit] Result: success=${result.success}`);
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

// バッチ送信エンドポイント（複数URL連続処理、SSEでストリーミング）
app.post("/auto-submit/batch", async (req, res) => {
  const { items, debug } = req.body as { items: Payload[]; debug?: boolean };

  console.log(
    `[auto-submit/batch] Request received: ${items?.length || 0} items`,
  );

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

  let browser: Browser | null = null;

  try {
    // 1つのブラウザインスタンスを起動
    console.log(`[auto-submit/batch] Launching browser (headless=${!debug})`);
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

      console.log(
        `[auto-submit/batch] Processing ${i + 1}/${items.length}: ${payload.url}`,
      );

      // 処理開始を通知
      res.write(
        `data: ${JSON.stringify({
          type: "item_start",
          index: i,
          url: payload.url,
        })}\n\n`,
      );

      try {
        const result = await autoSubmitWithBrowser(browser, payload);

        // 処理完了を通知
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

        console.log(
          `[auto-submit/batch] Completed ${i + 1}/${items.length}: success=${result.success}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.write(
          `data: ${JSON.stringify({
            type: "item_error",
            index: i,
            url: payload.url,
            error: message,
          })}\n\n`,
        );
        console.error(
          `[auto-submit/batch] Error ${i + 1}/${items.length}: ${message}`,
        );
      }
    }

    // 全完了を通知
    res.write(
      `data: ${JSON.stringify({ type: "batch_complete", total: items.length })}\n\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[auto-submit/batch] Fatal error: ${message}`);
    res.write(
      `data: ${JSON.stringify({ type: "fatal_error", error: message })}\n\n`,
    );
  } finally {
    if (browser) {
      await browser.close();
      console.log(`[auto-submit/batch] Browser closed`);
    }
    res.end();
  }
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
    console.log(`[autoSubmitWithBrowser] ${entry}`);
  }

  log(`=== autoSubmit START ===`);
  log(`Payload: url=${payload.url}, company=${payload.company}`);

  let page: Page | null = null;

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
      } catch (contactNavError) {
        const msg =
          contactNavError instanceof Error
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
            await anchor.scrollIntoViewIfNeeded().catch(() => {});
          }
        }
      }
    } else {
      log(`No separate contact page found, using current page`);
    }

    // Try to locate a form and fill
    log(`Finding and filling form`);
    const found = await findAndFillFormAnyContext(page, payload, log);
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
    await page.close().catch(() => {});

    return { success: submitted, logs, finalUrl };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    log(`UNEXPECTED ERROR: ${message}`);
    if (page) await page.close().catch(() => {});
    return { success: false, logs, finalUrl: page?.url(), note: message };
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
    console.log(`[autoSubmit] ${entry}`);
  }

  log(`=== autoSubmit START ===`);
  log(
    `Payload: url=${payload.url}, company=${payload.company}, department=${payload.department}, title=${payload.title}, email=${payload.email}`,
  );

  let browser: Browser | null = null;
  let page: Page | null = null;

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
    } catch (launchError) {
      const msg =
        launchError instanceof Error
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
    log(`Closing browser`);
    if (browser) await browser.close();
  }
}

function sanitizeUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
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

async function findAndFillForm(
  page: Page | Frame,
  payload: Payload,
  log: (s: string) => void,
): Promise<boolean> {
  const formLocators = [
    "form[action*='contact']",
    "form[action*='inquiry']",
    "form[action*='toiawase']",
    "form:has(input), form:has(textarea)",
  ];

  let formFound = null as null | ReturnType<Page["locator"]>;
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
  if (!formFound) return false;

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
        "input[placeholder*='姓（ふりがな）']",
        "input[placeholder*='姓（カナ）']",
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
        "input[placeholder*='名（ふりがな）']",
        "input[placeholder*='名（カナ）']",
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
          "よみがな",
          "ヨミガナ",
          "Furigana",
          "Kana",
        ],
        value: payload.fullNameKana,
      },
      {
        keywords: ["姓（ふりがな）", "せい", "セイ", "みょうじ", "ミョウジ"],
        value: payload.lastNameKana,
      },
      {
        keywords: ["名（ふりがな）", "めい", "メイ", "なまえ", "ナマエ"],
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
      // 最初の有効なオプション（空でない値）を選択
      const options = select.locator("option");
      const optionCount = await options.count();
      for (let j = 0; j < optionCount; j++) {
        const option = options.nth(j);
        const value = await option.getAttribute("value");
        const text = await option.textContent();
        // 空の値や「選択してください」系をスキップ
        if (value && value !== "" && !text?.includes("選択")) {
          await select.selectOption({ index: j });
          log(`Selected option index ${j} in select[${i}]`);
          break;
        }
      }
    } catch {
      // 選択できない場合はスキップ
    }
  }

  // チェックボックス：必須または最初のものをチェック
  const checkboxes = formFound.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  for (let i = 0; i < checkboxCount; i++) {
    const checkbox = checkboxes.nth(i);
    try {
      const isChecked = await checkbox.isChecked();
      if (!isChecked) {
        await checkbox.check();
        log(`Checked checkbox[${i}]`);
      }
    } catch {
      // チェックできない場合はスキップ
    }
  }

  // ラジオボタン：各グループの最初のものを選択
  const radioGroups = new Set<string>();
  const radios = formFound.locator('input[type="radio"]');
  const radioCount = await radios.count();
  for (let i = 0; i < radioCount; i++) {
    const radio = radios.nth(i);
    try {
      const name = await radio.getAttribute("name");
      if (name && !radioGroups.has(name)) {
        const isChecked = await radio.isChecked();
        if (!isChecked) {
          await radio.check();
          log(`Selected radio[${i}] (group: ${name})`);
        }
        radioGroups.add(name);
      }
    } catch {
      // 選択できない場合はスキップ
    }
  }

  return true;
}

async function submitForm(
  page: Page | Frame,
  log: (s: string) => void,
  dialogState: { detected: boolean; message: string },
): Promise<boolean> {
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
            .catch(() => {}),
          btn.click({ timeout: 3000 }).catch(() => {}),
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

  log("No submit button found");
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
    if ((await loc.count()) > 0) return loc;
  }
  return null;
}

async function findAndFillFormAnyContext(
  page: Page,
  payload: Payload,
  log: (s: string) => void,
): Promise<boolean> {
  if (await findAndFillForm(page, payload, log)) return true;
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    if (await findAndFillForm(frame, payload, log)) return true;
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
          const target = scope.locator(`#${CSS.escape(forId)}`);
          if ((await target.count()) > 0) {
            await target.fill(rule.value).catch(() => {});
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

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 Auto-submit server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Auto-submit:  POST http://localhost:${PORT}/auto-submit`);
});
