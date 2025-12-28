import express from 'express';
import cors from 'cors';
import { chromium, Browser, Page, Frame } from 'playwright';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS設定（Vercelからのリクエストを許可）
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['POST', 'OPTIONS'],
  credentials: true,
}));

app.use(express.json());

// ヘルスチェック
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 型定義
type Payload = {
  url: string;
  company?: string;
  person?: string;
  name?: string;
  email?: string;
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

// メインのauto-submitエンドポイント
app.post('/auto-submit', async (req, res) => {
  const payload = req.body as Payload;
  
  console.log(`[auto-submit] Request received: url=${payload.url}`);
  
  if (!payload.url) {
    return res.status(400).json({ 
      success: false, 
      logs: ['Missing required field: url'],
      note: 'URL is required' 
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
  log(`Payload: url=${payload.url}, company=${payload.company}, email=${payload.email}`);

  let browser: Browser | null = null;
  let page: Page | null = null;
  
  try {
    log(`Step 1: Launching browser (headless=${!payload.debug})`);
    try {
      browser = await chromium.launch({
        headless: !payload.debug,
        slowMo: payload.debug ? 200 : 0,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      log(`Step 1: Browser launched successfully`);
    } catch (launchError) {
      const msg = launchError instanceof Error ? launchError.message : String(launchError);
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
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      log(`Step 3: Navigation completed, current URL: ${page.url()}`);
    } catch (navError) {
      const msg = navError instanceof Error ? navError.message : String(navError);
      log(`Step 3: Navigation FAILED - ${msg}`);
      return { success: false, logs, finalUrl: page?.url(), note: `Navigation failed: ${msg}` };
    }
    await page.waitForLoadState('networkidle').catch(() => {
      log(`Step 3: networkidle timeout (non-fatal)`);
    });

    // Try to find a contact page link and navigate if needed
    log(`Step 4: Finding contact page link`);
    const contactUrl = await findContactPage(page, log);
    if (contactUrl && contactUrl !== page.url()) {
      log(`Step 4: Found contact page, navigating to: ${contactUrl}`);
      try {
        await page.goto(contactUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        log(`Step 4: Contact page navigation completed`);
      } catch (contactNavError) {
        const msg = contactNavError instanceof Error ? contactNavError.message : String(contactNavError);
        log(`Step 4: Contact page navigation FAILED - ${msg}`);
      }
      // If only hash changed, ensure section is in view
      if (contactUrl.includes('#')) {
        const hash = new URL(contactUrl).hash;
        if (hash) {
          const id = hash.replace('#', '');
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
        note: 'Form not found',
      };
    }
    log(`Step 5: Form found and filled`);

    // Try submit
    log(`Step 6: Submitting form`);
    const submitted = await submitFormAnyContext(page, log);
    log(submitted ? `Step 6: Form submitted successfully` : `Step 6: Form submission FAILED`);

    // Best-effort wait and capture final URL
    await page.waitForTimeout(2000);
    const finalUrl = page.url();
    log(`=== autoSubmit END === success=${submitted}, finalUrl=${finalUrl}`);
    return { success: submitted, logs, finalUrl };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    const stack = error instanceof Error ? error.stack : undefined;
    log(`UNEXPECTED ERROR: ${message}`);
    if (stack) log(`Stack: ${stack.split('\n').slice(0, 3).join(' | ')}`);
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
  log: (s: string) => void
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
      const href = await link.getAttribute('href');
      if (href) {
        const resolved = new URL(href, page.url()).toString();
        log(`Found contact link via selector ${sel}: ${resolved}`);
        return resolved;
      }
    }
  }

  const anchorCandidates = [
    'contact',
    'toiawase',
    'inquiry',
    'お問い合わせ',
    '問い合わせ',
    'support',
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
    const as = Array.from(document.querySelectorAll('a'));
    return as
      .map((a) => ({
        href: (a.getAttribute('href') || '').trim(),
        text: (a.textContent || '').trim(),
      }))
      .slice(0, 500);
  });
  const keywordParts = [
    'contact',
    'contact-us',
    'contactus',
    'inquiry',
    'toiawase',
    'support',
    'help',
    'feedback',
    'お問い合わせ',
    '問い合わせ',
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
    '/contact',
    '/contact/',
    '/contact-us',
    '/contactus',
    '/inquiry',
    '/inquiries',
    '/support',
    '/toiawase',
    '/company/contact',
    '/info/contact',
  ];
  for (const path of pathCandidates) {
    const candidate = new URL(path, base).toString();
    log(`Path candidate: ${candidate}`);
    return candidate;
  }

  log('No explicit contact link/anchor found; staying on current page');
  return null;
}

async function findAndFillForm(
  page: Page | Frame,
  payload: Payload,
  log: (s: string) => void
): Promise<boolean> {
  const formLocators = [
    "form[action*='contact']",
    "form[action*='inquiry']",
    "form[action*='toiawase']",
    'form:has(input), form:has(textarea)',
  ];

  let formFound = null as null | ReturnType<Page['locator']>;
  for (const fs of formLocators) {
    const loc = page.locator(fs).first();
    if ((await loc.count()) > 0) {
      formFound = loc;
      log(`Found form by selector: ${fs}`);
      break;
    }
  }
  if (!formFound) {
    const anyForm = page.locator('form').first();
    if ((await anyForm.count()) > 0) {
      formFound = anyForm;
      log('Fallback: using first form on the page');
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
        "input[name*='title']",
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
          '会社名',
          '御社名',
          '企業名',
          '貴社名',
          'Company',
          'Organization',
          'Corporate',
        ],
        value: payload.company,
      },
      {
        keywords: [
          '担当者',
          'ご担当者',
          '担当者名',
          'Person',
          'Contact person',
          'Your name',
        ],
        value: payload.person || payload.name,
      },
      { keywords: ['氏名', 'お名前', 'Name'], value: payload.name },
      { keywords: ['メール', 'E-mail', 'Email'], value: payload.email },
      { keywords: ['電話', 'Tel', 'Phone'], value: payload.phone },
      { keywords: ['件名', 'Subject', '題名'], value: payload.subject },
      {
        keywords: ['本文', 'お問い合わせ内容', 'Message', '内容'],
        value: payload.message,
      },
    ],
    log
  );

  if (payload.message) {
    const messageSelectors = [
      "textarea[name*='message']",
      "textarea[id*='message']",
      "textarea[placeholder*='お問い合わせ']",
      'textarea',
    ];
    const found = await locateFirst(page, formFound, messageSelectors);
    if (found) {
      await found.fill(payload.message);
      log('Filled message textarea');
    }
  }

  return true;
}

async function submitForm(
  page: Page | Frame,
  log: (s: string) => void
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
        await Promise.all([
          page
            .waitForNavigation({ waitUntil: 'load', timeout: 15000 })
            .catch(() => {}),
          btn.click({ timeout: 3000 }).catch(() => {}),
        ]);
        log(`Clicked submit via ${sel}`);

        const finalBtn = page
          .locator("button:has-text('送信'), input[type='submit']")
          .first();
        if ((await finalBtn.count()) > 0) {
          await Promise.all([
            page
              .waitForNavigation({ waitUntil: 'load', timeout: 15000 })
              .catch(() => {}),
            finalBtn.click({ timeout: 3000 }).catch(() => {}),
          ]);
          log('Clicked final submit');
        }
        return true;
      } catch {
        // continue
      }
    }
  }
  return false;
}

async function locateFirst(
  page: Page | Frame,
  scope: ReturnType<Page['locator']>,
  selectors: string[]
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
  log: (s: string) => void
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
  log: (s: string) => void
): Promise<boolean> {
  if (await submitForm(page, log)) return true;
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    if (await submitForm(frame, log)) return true;
  }
  return false;
}

async function fillByLabel(
  page: Page | Frame,
  scope: ReturnType<Page['locator']>,
  rules: Array<{ keywords: string[]; value?: string }>,
  log: (s: string) => void
) {
  for (const rule of rules) {
    if (!rule.value) continue;
    for (const kw of rule.keywords) {
      const label = scope.locator('label', { hasText: kw }).first();
      if ((await label.count()) > 0) {
        const forId = await label.getAttribute('for');
        if (forId) {
          const target = scope.locator(`#${CSS.escape(forId)}`);
          if ((await target.count()) > 0) {
            await target.fill(rule.value).catch(() => {});
            log(`Filled via label(${kw}) -> #${forId}`);
            break;
          }
        } else {
          const target = label.locator('input,textarea');
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

