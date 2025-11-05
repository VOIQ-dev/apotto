import { chromium, Browser, Page, Frame } from 'playwright';

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

export async function autoSubmit(payload: Payload): Promise<Result> {
  const logs: string[] = [];
  function log(line: string) {
    logs.push(line);
  }

  let browser: Browser | null = null;
  let page: Page | null = null;
  try {
    log(`Launching browser`);
    browser = await chromium.launch({
      headless: !payload.debug,
      slowMo: payload.debug ? 200 : 0,
    });
    const context = await browser.newContext();
    page = await context.newPage();

    const startUrl = sanitizeUrl(payload.url);
    log(`Navigating to: ${startUrl}`);
    await page.goto(startUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForLoadState('networkidle').catch(() => {});

    // Try to find a contact page link and navigate if needed
    const contactUrl = await findContactPage(page, log);
    if (contactUrl && contactUrl !== page.url()) {
      log(`Navigating to contact page: ${contactUrl}`);
      await page.goto(contactUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
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
    }

    // Try to locate a form and fill (including iframes)
    const found = await findAndFillFormAnyContext(page, payload, log);
    if (!found) {
      log('No suitable contact form found');
      return {
        success: false,
        logs,
        finalUrl: page.url(),
        note: 'Form not found',
      };
    }

    // Try submit
    const submitted = await submitFormAnyContext(page, log);
    log(submitted ? 'Submitted form' : 'Failed to submit');

    // Best-effort wait and capture final URL
    await page.waitForTimeout(2000);
    const finalUrl = page.url();
    return { success: submitted, logs, finalUrl };
  } catch (e: any) {
    log(`Error: ${e?.message ?? String(e)}`);
    return { success: false, logs, finalUrl: page?.url() };
  } finally {
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
  // Heuristics: look for links containing contact words
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
  // Fallback: on-page anchors without explicit links
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
  // Fallback: scan all anchors for likely keywords (href or text)
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

  // Fallback: try common paths without clicking
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
    return candidate; // return first candidate; caller will attempt navigation
  }

  log('No explicit contact link/anchor found; staying on current page');
  return null;
}

async function findAndFillForm(
  page: Page | Frame,
  payload: Payload,
  log: (s: string) => void
): Promise<boolean> {
  // Try a few likely form selectors
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
    // fallback: take the first form
    const anyForm = page.locator('form').first();
    if ((await anyForm.count()) > 0) {
      formFound = anyForm;
      log('Fallback: using first form on the page');
    }
  }
  if (!formFound) return false;

  // Field heuristics mapping
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

  // Label-based filling
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
  // Try button selectors
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

        // If the first click was a confirm step, try to find a final submit
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
