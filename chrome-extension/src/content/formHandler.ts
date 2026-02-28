/// <reference types="chrome" />

// ===== 全体をIIFEで囲んで重複宣言エラーを防止 =====
(function () {
  // 重複実行防止（chrome.scripting.executeScriptで複数回注入される場合の対策）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalWindow = window as any;

  if (globalWindow.__apottoFormHandlerLoaded) {
    console.log("[Apotto Content] Already loaded, skipping re-initialization");
    return; // 重複時はここで終了
  }

  globalWindow.__apottoFormHandlerLoaded = true;
  console.log(
    `[Apotto Content] Loaded on ${window.location.href} (readyState: ${document.readyState})`,
  );

  // IIFE トップレベルに配置（ミニファイ時のTDZ回避）
  const PREFERRED_OPTION_KEYWORDS = [
    "その他",
    "other",
    "一般",
    "お問い合わせ",
    "問い合わせ",
    "製品",
    "サービス",
    "general",
  ];
  const AVOID_OPTION_KEYWORDS = [
    "採用",
    "資料請求",
    "見積",
    "パートナー",
    "代理店",
    "recruit",
    "download",
  ];

  interface FormData {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    message?: string;
    lastName?: string;
    firstName?: string;
    lastNameKana?: string;
    firstNameKana?: string;
    fullNameKana?: string;
    postalCode?: string;
    prefecture?: string;
    city?: string;
    address?: string;
    department?: string;
    title?: string;
    subject?: string;
    [key: string]: string | undefined;
  }

  interface QueueItem {
    id: string;
    url: string;
    company: string;
    leadId: string;
    formData: FormData;
  }

  // ログ関数（Backgroundにも送信）
  const debugLogs: string[] = [];

  function log(message: string) {
    const timestamp = new Date().toISOString().substring(11, 23);
    const logMessage = `[${timestamp}] ${message}`;
    console.log(`[Apotto Content] ${logMessage}`);
    debugLogs.push(logMessage);

    // Backgroundにログを送信
    try {
      chrome.runtime
        .sendMessage({
          type: "DEBUG_LOG",
          message: logMessage,
        })
        .catch(() => {
          /* ignore */
        });
    } catch {
      // ignore
    }
  }

  function getDebugLogs(): string[] {
    return debugLogs.slice(-50); // 最新50件
  }

  // メッセージリスナー
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log(
      `[Apotto Content] Message received: ${message.type} on ${window.location.href}`,
    );

    // READYハンドシェイク: Background Scriptからの疎通確認
    if (message.type === "PING_CONTENT") {
      console.log(`[Apotto Content] PING received, responding READY`);
      sendResponse({ success: true, ready: true, url: window.location.href });
      return false;
    }

    if (message.type === "GET_DEBUG_LOGS") {
      sendResponse({ debugLogs: getDebugLogs() });
      return false;
    }

    if (message.type === "CHECK_SUCCESS_TEXT") {
      const isSuccess = isSuccessPage() || checkFormPluginComplete();
      console.log(
        `[Apotto Content] CHECK_SUCCESS_TEXT: isSuccess=${isSuccess}, url=${window.location.href}`,
      );
      sendResponse({ isSuccess, url: window.location.href });
      return false;
    }

    if (message.type === "HANDLE_CONFIRMATION_PAGE") {
      console.log(
        `[Apotto Content] HANDLE_CONFIRMATION_PAGE on ${window.location.href}`,
      );
      handleConfirmationPage()
        .then((result) => {
          console.log(
            `[Apotto Content] Confirmation page result: ${JSON.stringify(result)}`,
          );
          sendResponse(result);
        })
        .catch((error) => {
          console.error("[Apotto Content] Confirmation page error:", error);
          sendResponse({
            success: false,
            error: `確認ページ処理エラー: ${String(error)}`,
          });
        });
      return true;
    }

    if (message.type === "FILL_AND_SUBMIT_FORM") {
      console.log(
        `[Apotto Content] Starting form submission for: ${message.payload?.company}`,
      );
      handleFormSubmission(message.payload)
        .then((result) => {
          console.log(
            `[Apotto Content] Form submission completed: success=${result.success}`,
          );
          sendResponse(result);
        })
        .catch((error) => {
          console.error("[Apotto Content] Error:", error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        });
      return true; // 非同期レスポンス
    }

    if (message.type === "FIND_CONTACT_PAGE") {
      findContactPageCandidates()
        .then((candidates) => {
          console.log(
            `[Apotto Content] Found ${candidates.length} contact page candidates`,
          );
          sendResponse({ success: true, candidates });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        });
      return true;
    }

    if (message.type === "CHECK_FOR_FORM") {
      // debugInfo拡張: フォーム検索結果の詳細を返す
      const debugInfo = collectFormDebugInfo();

      // ページ種別判定
      const pageClass = classifyPageType();
      (debugInfo as Record<string, unknown>).pageClassification =
        pageClass.type;
      if (pageClass.type !== "allowed") {
        (debugInfo as Record<string, unknown>).pageClassificationReason = (
          pageClass as { reason: string }
        ).reason;
      }

      // フォームスコアリング結果を収集
      const allForms = document.querySelectorAll<HTMLFormElement>("form");
      let bestScore = 0;
      let bestReasons: string[] = [];
      for (const f of allForms) {
        const result = scoreFormCandidate(f);
        if (result.score > bestScore) {
          bestScore = result.score;
          bestReasons = result.reasons;
        }
      }
      // ボタン逆引きも試す
      if (allForms.length === 0) {
        const pseudoForms = findPseudoFormsViaButtons();
        for (const pf of pseudoForms) {
          const result = scoreFormCandidate(pf);
          if (result.score > bestScore) {
            bestScore = result.score;
            bestReasons = result.reasons;
          }
        }
      }
      debugInfo.bestScore = bestScore;
      debugInfo.bestReasons = bestReasons;

      const form = findContactForm();
      const hasForm = !!form;

      console.log(
        `[Apotto Content] CHECK_FOR_FORM result: hasForm=${hasForm}, bestScore=${bestScore}, pageType=${pageClass.type}, reasons=[${bestReasons.join(", ")}]`,
        debugInfo,
      );
      sendResponse({
        success: true,
        hasForm,
        debugInfo,
      });
      return false;
    }

    // お問い合わせ関連リンクを収集（外部ドメイン含む）
    if (message.type === "FIND_CONTACT_LINKS") {
      try {
        const links = findContactLinks();
        const preferred = links.filter((l) => l.tier === "preferred").length;
        const fallback = links.filter((l) => l.tier === "fallback").length;
        console.log(
          `[Apotto Content] FIND_CONTACT_LINKS: found ${links.length} links (preferred=${preferred}, fallback=${fallback})`,
        );
        sendResponse({ success: true, links });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          links: [],
        });
      }
      return false;
    }

    // DOMが空のページで、問い合わせ導線ボタンを押してフォーム表示を試行
    if (message.type === "TRY_OPEN_CONTACT_UI") {
      tryOpenContactUi()
        .then((result) => {
          sendResponse({ success: true, ...result });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            opened: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        });
      return true;
    }
  });

  // フォーム検索のデバッグ情報を収集
  function collectFormDebugInfo(): Record<string, unknown> {
    const forms = document.querySelectorAll("form");
    const inputs = document.querySelectorAll('input:not([type="hidden"])');
    const textareas = document.querySelectorAll("textarea");
    const emailFields = document.querySelectorAll(
      'input[type="email"], input[name*="mail" i]',
    );
    const iframes = document.querySelectorAll("iframe");
    const buttons = document.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], a.btn, a.button, a[class*="submit"], a[class*="btn-primary"]',
    );

    // 送信/確認ボタンのテキストを収集
    const buttonTexts: string[] = [];
    buttons.forEach((btn) => {
      const text = (
        btn.textContent ||
        (btn as HTMLInputElement).value ||
        ""
      ).trim();
      if (text) buttonTexts.push(text.substring(0, 30));
    });

    // 確認ボタン・送信ボタンが存在するか確認
    const confirmButtons = Array.from(buttons).filter((btn) => {
      const text = (
        btn.textContent ||
        (btn as HTMLInputElement).value ||
        ""
      ).toLowerCase();
      return text.includes("確認") || text.includes("入力内容");
    });

    const submitButtons = Array.from(buttons).filter((btn) => {
      const text = (
        btn.textContent ||
        (btn as HTMLInputElement).value ||
        ""
      ).toLowerCase();
      return text.includes("送信") || text.includes("submit");
    });

    // CAPTCHA検出
    const captchaInfo = detectCaptcha();

    // 外部フォームサービスの読み込み待ちを検出
    const hasExternalFormLoading = !!(
      document.querySelector(
        '.hbspt-form, [id*="hubspot-form"], [id*="hs_form"], [data-formid]',
      ) ||
      document.querySelector(
        'script[src*="hsforms"], script[src*="hbspt"], script[src*="hubspot"]',
      ) ||
      document.querySelector('.mktoForm, [id*="mktoForm"]') ||
      document.querySelector(
        'script[src*="marketo"], script[src*="munchkin"]',
      ) ||
      document.querySelector('[class*="pardot"], [id*="pardot"]') ||
      document.querySelector('script[src*="pardot"]') ||
      document.querySelector('[id*="k3form"], [data-k3]') ||
      document.querySelector('script[src*="k3r.jp"]')
    );

    // iframeにフォームがある可能性
    const formIframes = Array.from(iframes).filter((iframe) => {
      const src = (iframe as HTMLIFrameElement).src?.toLowerCase() || "";
      return /form|contact|inquiry|hubspot|marketo|pardot|enquete/.test(src);
    });

    return {
      url: window.location.href,
      title: document.title,
      formCount: forms.length,
      inputCount: inputs.length,
      textareaCount: textareas.length,
      hasEmailField: emailFields.length > 0,
      iframeCount: iframes.length,
      buttonCount: buttons.length,
      buttonTexts: buttonTexts.slice(0, 10),
      hasConfirmButton: confirmButtons.length > 0,
      confirmButtonCount: confirmButtons.length,
      hasSubmitButton: submitButtons.length > 0,
      submitButtonCount: submitButtons.length,
      hasCaptcha: captchaInfo.hasCaptcha,
      captchaType: captchaInfo.captchaType,
      captchaIsBlocker: captchaInfo.isBlocker,
      readyState: document.readyState,
      timestamp: new Date().toISOString(),
      hasExternalFormLoading,
      formIframeCount: formIframes.length,
      formIframeSrcs: formIframes
        .map((f) => (f as HTMLIFrameElement).src)
        .slice(0, 3),
    };
  }

  // ===== お問い合わせページ検索機能（サーバー側と同等） =====
  async function findContactPageCandidates(): Promise<string[]> {
    const candidates: string[] = [];
    const seen = new Set<string>();

    // 現在のページを最初に追加
    const currentUrlRaw = window.location.href;
    const currentUrl =
      normalizeContactCandidateUrl(currentUrlRaw) || currentUrlRaw;
    candidates.push(currentUrl);
    seen.add(currentUrl);

    log("Searching for contact page candidates...");

    // 1. 明示的なお問い合わせリンクを探す
    const linkSelectors = [
      'a[href*="contact"]',
      'a[href*="inquiry"]',
      'a[href*="toiawase"]',
      'a[href*="otoiawase"]',
      'a[href*="form"]',
    ];

    for (const selector of linkSelectors) {
      try {
        const links = document.querySelectorAll<HTMLAnchorElement>(selector);
        for (const link of links) {
          const href = link.href;
          if (!href) continue;

          const normalizedHref = normalizeContactCandidateUrl(href);
          if (!normalizedHref) continue;
          if (isLikelyNonHtmlResource(normalizedHref)) continue;

          if (!seen.has(normalizedHref) && isSameOrigin(normalizedHref)) {
            log(
              `Found contact link via selector ${selector}: ${normalizedHref}`,
            );
            candidates.push(normalizedHref);
            seen.add(normalizedHref);
          }
        }
      } catch (err) {
        log(`Selector ${selector} failed`);
      }
    }

    // 2. テキストでお問い合わせリンクを探す
    const textPatterns = [
      "お問い合わせ",
      "問い合わせ",
      "お問合せ",
      "問合せ",
      "Contact",
      "CONTACT",
      "Inquiry",
      "その他",
      "その他の",
      "その他のお問い合わせ",
      "other",
      "others",
      "一般",
      "General",
    ];

    const allLinks = document.querySelectorAll<HTMLAnchorElement>("a");
    for (const link of allLinks) {
      const text = link.textContent?.trim() || "";
      const href = link.href;

      if (!href) continue;

      const normalizedHref = normalizeContactCandidateUrl(href);
      if (!normalizedHref) continue;
      if (seen.has(normalizedHref) || !isSameOrigin(normalizedHref)) continue;
      if (isLikelyNonHtmlResource(normalizedHref)) continue;

      for (const pattern of textPatterns) {
        if (text.includes(pattern)) {
          log(`Found contact link via text "${pattern}": ${normalizedHref}`);
          candidates.push(normalizedHref);
          seen.add(normalizedHref);
          break;
        }
      }
    }

    // 3. ナビゲーション・フッター内のリンクを優先的に探す
    const navSelectors = [
      "nav",
      "header",
      "footer",
      ".nav",
      ".header",
      ".footer",
      "#nav",
      "#header",
      "#footer",
    ];
    for (const navSel of navSelectors) {
      const nav = document.querySelector(navSel);
      if (!nav) continue;

      const navLinks = nav.querySelectorAll<HTMLAnchorElement>("a");
      for (const link of navLinks) {
        const text = link.textContent?.trim().toLowerCase() || "";
        const href = link.href;

        if (!href) continue;

        const normalizedHref = normalizeContactCandidateUrl(href);
        if (!normalizedHref) continue;
        if (seen.has(normalizedHref) || !isSameOrigin(normalizedHref)) continue;
        if (isLikelyNonHtmlResource(normalizedHref)) continue;

        if (
          text.includes("問い合わせ") ||
          text.includes("contact") ||
          text.includes("inquiry") ||
          normalizedHref.includes("contact") ||
          normalizedHref.includes("inquiry")
        ) {
          log(`Found nav contact link: ${normalizedHref}`);
          candidates.push(normalizedHref);
          seen.add(normalizedHref);
        }
      }
    }

    log(
      `Found ${candidates.length} contact page candidates (from page links only)`,
    );
    return candidates;
  }

  // 同一オリジンかチェック
  function isSameOrigin(url: string): boolean {
    try {
      const targetUrl = new URL(url);
      return targetUrl.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  // トラッキング用途のクエリを除去して、探索用URLを安定化
  function normalizeContactCandidateUrl(rawUrl: string): string | null {
    try {
      const url = new URL(rawUrl, window.location.href);
      if (!/^https?:$/i.test(url.protocol)) return null;

      // ハッシュルーター系で問い合わせページを指すハッシュは保持する
      const hashValue = url.hash || "";
      let decodedHash = hashValue.toLowerCase();
      try {
        decodedHash = decodeURIComponent(hashValue).toLowerCase();
      } catch {
        // デコード失敗時は元のハッシュを利用
      }
      const isHashRouteStyle =
        /^#(!?\/|!)/.test(hashValue) || hashValue.includes("/");
      const hasContactHashKeyword =
        /(contact|inquiry|enquiry|toiawase|otoiawase|form|request|soudan|お問|問合|問い合わせ)/i.test(
          decodedHash,
        );
      if (!isHashRouteStyle || !hasContactHashKeyword) {
        // 通常のアンカーは探索ノイズになるため除去
        url.hash = "";
      }

      const trackingParamPatterns = [
        /^utm_/i,
        /^fbclid$/i,
        /^gclid$/i,
        /^dclid$/i,
        /^msclkid$/i,
        /^yclid$/i,
        /^_ga$/i,
        /^_gl$/i,
        /^__hs/i,
        /^ct_/i,
      ];
      const paramKeys = Array.from(url.searchParams.keys());
      for (const key of paramKeys) {
        if (trackingParamPatterns.some((pat) => pat.test(key))) {
          url.searchParams.delete(key);
        }
      }

      return url.toString();
    } catch {
      return null;
    }
  }

  // フォーム探索対象として不適切なファイルURLを除外
  function isLikelyNonHtmlResource(url: string): boolean {
    try {
      const pathname = new URL(
        url,
        window.location.href,
      ).pathname.toLowerCase();
      return /\.(pdf|zip|rar|7z|doc|docx|xls|xlsx|ppt|pptx|csv|txt|xml|json|jpg|jpeg|png|gif|webp|svg|mp3|mp4|avi|mov|wmv|exe|dmg|iso)$/.test(
        pathname,
      );
    } catch {
      return false;
    }
  }

  // リンク優先度ティア
  type LinkTier = "preferred" | "fallback" | "excluded";

  // お問い合わせ関連リンクを収集（外部ドメイン含む、FIND_CONTACT_LINKS 用）
  function findContactLinks(): {
    url: string;
    text: string;
    isExternal: boolean;
    tier: LinkTier;
  }[] {
    const results: {
      url: string;
      text: string;
      isExternal: boolean;
      tier: LinkTier;
    }[] = [];
    const seen = new Set<string>();

    // preferred: 一般的なお問い合わせ
    const PREFERRED_TEXT_KEYWORDS = [
      "お問い合わせ",
      "お問合せ",
      "お問合わせ",
      "問い合わせ",
      "問合せ",
      "問合わせ",
      "contact",
      "inquiry",
      "enquiry",
      "ご意見",
      "ご感想",
      "その他",
    ];

    // fallback: 導入相談系（他に見つからない場合のみ使用）
    const FALLBACK_TEXT_KEYWORDS = [
      "相談",
      "ご相談",
      "導入",
      "デモ",
      "demo",
      "見積",
      "estimate",
      "トライアル",
      "trial",
    ];

    // excluded: 常に除外
    const EXCLUDED_TEXT_PATTERNS = [
      /資料請求/,
      /資料ダウンロード/,
      /メルマガ/,
      /ニュースレター/,
      /newsletter/i,
      /whitepaper/i,
      /subscribe/i,
      /ホワイトペーパー/,
      /カタログ.*ダウンロード/,
      /無料ダウンロード/,
    ];

    // URLパスで検出するキーワード（hrefのみで判定）
    const CONTACT_HREF_KEYWORDS = [
      "contact",
      "inquiry",
      "enquiry",
      "form",
      "toiawase",
      "otoiawase",
    ];

    const HARD_EXCLUDE_PATTERNS = [
      /^tel:/i,
      /^mailto:/i,
      /^javascript:/i,
      /^#/,
      /faq/i,
      /よくある質問/,
      /login/i,
      /ログイン/,
      /search/i,
      /検索/,
      /download/i,
      /ダウンロード/,
      /採用/,
      /recruit/i,
    ];

    const HREF_EXCLUDE_PATTERNS = [
      /\/platform/i,
      /\/reform/i,
      /\/perform/i,
      /\/inform(?!ation)/i,
      /\/formul/i,
      /\/formal/i,
      /\/format/i,
      /\/estimate/i,
      /\/trial/i,
      /\/demo/i,
      /\/quotation/i,
      /\/quote/i,
      /\/pricing/i,
      /\/download/i,
      /\/whitepaper/i,
      /\/document[-_]?request/i,
    ];

    const currentUrl = window.location.href;
    const normalizedCurrentUrl =
      normalizeContactCandidateUrl(currentUrl) || currentUrl;
    seen.add(normalizedCurrentUrl);

    const allLinks = document.querySelectorAll<HTMLAnchorElement>("a[href]");

    for (const link of allLinks) {
      const href = link.href;
      if (!href) continue;

      const rawHref = link.getAttribute("href") || "";
      if (HARD_EXCLUDE_PATTERNS.some((pat) => pat.test(rawHref))) continue;

      const normalizedHref = normalizeContactCandidateUrl(href);
      if (!normalizedHref) continue;
      if (seen.has(normalizedHref)) continue;
      if (isLikelyNonHtmlResource(normalizedHref)) continue;

      const text = (link.textContent || "").trim();
      const textLower = text.toLowerCase();
      const ariaLabel = (link.getAttribute("aria-label") || "").toLowerCase();
      const title = (link.getAttribute("title") || "").toLowerCase();
      const combinedText = `${textLower} ${ariaLabel} ${title}`;

      // excluded テキストチェック
      if (EXCLUDED_TEXT_PATTERNS.some((pat) => pat.test(combinedText)))
        continue;

      // preferred テキストマッチ
      const isPreferred = PREFERRED_TEXT_KEYWORDS.some((kw) =>
        combinedText.includes(kw.toLowerCase()),
      );

      // fallback テキストマッチ
      const isFallback =
        !isPreferred &&
        FALLBACK_TEXT_KEYWORDS.some((kw) =>
          combinedText.includes(kw.toLowerCase()),
        );

      // URLパスでのマッチ
      let matchesByHref = false;
      try {
        const urlPath = new URL(normalizedHref).pathname.toLowerCase();
        matchesByHref =
          CONTACT_HREF_KEYWORDS.some((kw) => urlPath.includes(kw)) &&
          !HREF_EXCLUDE_PATTERNS.some((pat) => pat.test(urlPath));
      } catch {
        // invalid URL
      }

      if (!isPreferred && !isFallback && !matchesByHref) continue;

      try {
        new URL(normalizedHref);
      } catch {
        continue;
      }

      seen.add(normalizedHref);

      let tier: LinkTier;
      if (isFallback) {
        // テキストが明示的に fallback カテゴリ（導入・相談等）→ URL に contact が含まれても fallback
        tier = "fallback";
      } else if (isPreferred || matchesByHref) {
        tier = "preferred";
      } else {
        tier = "fallback";
      }

      results.push({
        url: normalizedHref,
        text: text.substring(0, 100),
        isExternal: !isSameOrigin(normalizedHref),
        tier,
      });
    }

    // preferred を先頭に、fallback を後ろにソート
    results.sort((a, b) => {
      if (a.tier === "preferred" && b.tier !== "preferred") return -1;
      if (a.tier !== "preferred" && b.tier === "preferred") return 1;
      return 0;
    });

    return results;
  }

  // DOMが空のページで問い合わせ導線を押し、モーダル/動的フォーム表示を試す
  async function tryOpenContactUi(): Promise<{
    opened: boolean;
    clickedText?: string;
    urlChanged?: boolean;
  }> {
    const beforeUrl = window.location.href;
    const beforeForms = document.querySelectorAll("form").length;
    const beforeInputs = document.querySelectorAll(
      'input:not([type="hidden"])',
    ).length;

    const includeKeywords = [
      "お問い合わせ",
      "お問合せ",
      "問い合わせ",
      "contact",
      "inquiry",
      "enquiry",
    ];
    const excludeKeywords = [
      "採用",
      "recruit",
      "求人",
      "login",
      "ログイン",
      "news",
      "お知らせ",
      "privacy",
      "プライバシー",
      "利用規約",
      "terms",
      "download",
      "ダウンロード",
      "pdf",
      "資料請求",
      "メルマガ",
      "ニュースレター",
      "newsletter",
      "subscribe",
      "購読",
      "ホワイトペーパー",
      "whitepaper",
      "導入",
      "デモ",
      "demo",
      "見積",
      "estimate",
      "トライアル",
      "trial",
      "無料体験",
    ];

    const clickableSelector =
      'button, a[href], input[type="button"], input[type="submit"], [role="button"], summary';
    const candidates: { el: HTMLElement; score: number; text: string }[] = [];

    for (const el of document.querySelectorAll<HTMLElement>(
      clickableSelector,
    )) {
      if (!isButtonVisible(el)) continue;

      if (el instanceof HTMLAnchorElement) {
        try {
          const target = new URL(el.href, window.location.href);
          if (target.origin !== window.location.origin) continue;
        } catch {
          continue;
        }
      }

      const rawText = (
        (el as HTMLInputElement).value ||
        el.textContent ||
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        ""
      ).trim();
      if (!rawText) continue;

      const textLower = rawText.toLowerCase();
      if (excludeKeywords.some((kw) => textLower.includes(kw))) continue;
      if (!includeKeywords.some((kw) => textLower.includes(kw.toLowerCase()))) {
        continue;
      }

      let score = 10;
      if (el instanceof HTMLAnchorElement) {
        const hrefLower = (
          el.getAttribute("href") ||
          el.href ||
          ""
        ).toLowerCase();
        if (
          /contact|inquiry|enquiry|toiawase|otoiawase|form|request|soudan/.test(
            hrefLower,
          )
        ) {
          score += 8;
        }
      }
      if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
        score += 2;
      }

      candidates.push({
        el,
        score,
        text: rawText.substring(0, 80),
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length === 0) {
      return { opened: false };
    }

    for (const candidate of candidates.slice(0, 3)) {
      try {
        const beforeClickUrl = window.location.href;
        // target="_blank" を除去して現在タブで遷移させる（別タブが開いて追跡不能になるのを防ぐ）
        if (
          candidate.el instanceof HTMLAnchorElement &&
          candidate.el.target === "_blank"
        ) {
          candidate.el.target = "_self";
        }
        candidate.el.click();

        for (let i = 0; i < 5; i++) {
          await sleep(400);
          const formCount = document.querySelectorAll("form").length;
          const inputCount = document.querySelectorAll(
            'input:not([type="hidden"])',
          ).length;
          const urlChanged = window.location.href !== beforeClickUrl;

          if (
            formCount > beforeForms ||
            inputCount > beforeInputs ||
            urlChanged
          ) {
            log(
              `TRY_OPEN_CONTACT_UI clicked "${candidate.text}" (score=${candidate.score}) forms:${beforeForms}->${formCount}, inputs:${beforeInputs}->${inputCount}, urlChanged=${urlChanged}`,
            );
            return {
              opened: true,
              clickedText: candidate.text,
              urlChanged,
            };
          }
        }
      } catch {
        // 次候補を試す
      }
    }

    const finalUrlChanged = window.location.href !== beforeUrl;
    return {
      opened: finalUrlChanged,
      clickedText: undefined,
      urlChanged: finalUrlChanged,
    };
  }

  // フォーム送信処理（強化版）
  async function handleFormSubmission(item: QueueItem): Promise<{
    success: boolean;
    finalUrl?: string;
    error?: string;
    debugLogs?: string[];
    debugInfo?: Record<string, unknown>;
    validationInfo?: {
      phase: string;
      errors: { field: string; message: string }[];
    }[];
  }> {
    log(`Starting form submission for: ${item.company}`);
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "formHandler.ts:225",
        message: "handleFormSubmission started",
        data: {
          company: item.company,
          url: item.url,
          currentUrl: window.location.href,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "A",
      }),
    }).catch(() => {});
    // #endregion

    try {
      // 1. 現在のページでフォームを探す（Background側で既にフォームページに遷移済み）
      const form = findContactForm();
      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "formHandler.ts:251",
            message: "Form search result",
            data: { formFound: !!form, currentUrl: window.location.href },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "B",
          }),
        },
      ).catch(() => {});
      // #endregion

      if (!form) {
        // フォームが見つからない場合、既に送信完了ページかチェック
        // MW WP Form等のプラグインは同じURLで完了画面を表示するため
        if (isSuccessPage() || checkFormPluginComplete()) {
          log(
            "No form found, but success/completion page detected — treating as success",
          );
          return {
            success: true,
            finalUrl: window.location.href,
            debugLogs: getDebugLogs(),
          };
        }

        const debugInfo = collectDebugInfo();
        log(
          `Debug info: forms=${debugInfo.formCount}, inputs=${debugInfo.inputCount}, email=${debugInfo.hasEmailField}, textarea=${debugInfo.hasTextarea}`,
        );
        return {
          success: false,
          error: `フォームが見つかりません (forms=${debugInfo.formCount}, inputs=${debugInfo.inputCount})`,
          debugLogs: getDebugLogs(),
          debugInfo,
        };
      }

      log("Form found, starting to fill...");

      // 2. フォームに入力
      await fillForm(form, item.formData);
      log("Form filled successfully");

      // 2.3. 入力直後のバリデーションエラーをスキャン（ページ上に表示された文言を収集）
      await sleep(500);
      const postFillErrors = scanVisibleValidationErrors(form);
      if (postFillErrors.length > 0) {
        log(
          `📋 [入力直後バリデーション] ${postFillErrors.length}件のエラー検出:`,
        );
        for (const err of postFillErrors) {
          log(
            `  ⚠️ フィールド: ${err.fieldName || "不明"} | エラー: "${err.message}" | セレクタ: ${err.fieldSelector || "N/A"}`,
          );
        }
      } else {
        log(`📋 [入力直後バリデーション] エラーなし`);
      }

      // 2.5. 入力前バリデーションチェック（送信前に未入力を検出）
      const preCheck = detectValidationErrors(form);
      if (preCheck.hasErrors) {
        log(
          `📋 [送信前バリデーション] ${preCheck.errorFields.length}件のエラーフィールド: ${preCheck.errorFields.join(", ")}`,
        );
        for (const msg of preCheck.errorMessages) {
          log(`  ⚠️ ${msg}`);
        }
        log(
          `Attempting to fix ${preCheck.errorFields.length} fields before submit...`,
        );
        const fixedFields = await retryFillAfterValidation(
          form,
          item.formData,
          preCheck.errorFields,
        );
        if (fixedFields.length > 0) {
          log(
            `Pre-submit fix: ${fixedFields.length} fields corrected: ${fixedFields.join(", ")}`,
          );
        }
        await sleep(300);

        // 修正後に再度チェック
        const reCheck = detectValidationErrors(form);
        if (reCheck.hasErrors) {
          log(
            `📋 [修正後バリデーション] まだ${reCheck.errorFields.length}件のエラーが残存:`,
          );
          for (const msg of reCheck.errorMessages) {
            log(`  ❌ ${msg}`);
          }
        } else {
          log(`📋 [修正後バリデーション] 全エラー解消`);
        }
      }

      // バリデーション情報を蓄積（最終結果に含める用）
      const validationHistory: {
        phase: string;
        errors: { field: string; message: string }[];
      }[] = [];

      if (postFillErrors.length > 0) {
        validationHistory.push({
          phase: "入力直後",
          errors: postFillErrors.map((e) => ({
            field: e.fieldName || "不明",
            message: e.message,
          })),
        });
      }
      if (preCheck.hasErrors) {
        validationHistory.push({
          phase: "送信前チェック",
          errors: preCheck.errorMessages.map((msg, i) => ({
            field: preCheck.errorFields[i] || "不明",
            message: msg,
          })),
        });
      }

      // 3. 確認ボタンまたは送信ボタンを押す
      const submitResult = await submitForm(form);
      if (!submitResult.success) {
        return {
          success: false,
          error: submitResult.error,
          debugLogs: getDebugLogs(),
          validationInfo:
            validationHistory.length > 0 ? validationHistory : undefined,
        };
      }

      // 3.5. 送信後バリデーションエラー検知 & リトライ（最大2回）
      const MAX_VALIDATION_RETRIES = 2;
      for (let retry = 0; retry < MAX_VALIDATION_RETRIES; retry++) {
        await sleep(1000);

        // 成功ページなら即座にリトライ不要
        if (isSuccessPage() || checkFormPluginComplete()) {
          return {
            success: true,
            finalUrl: window.location.href,
            debugLogs: getDebugLogs(),
          };
        }

        // フォームがまだ存在するか確認（ページ遷移していない場合のみバリデーションチェック）
        const currentForm = findContactForm();
        if (!currentForm) break;

        const postCheck = detectValidationErrors(currentForm);
        // ページ上の表示エラーも追加スキャン
        const visibleErrors = scanVisibleValidationErrors(currentForm);

        if (!postCheck.hasErrors && visibleErrors.length === 0) break;

        // バリデーション履歴に蓄積
        const retryErrors: { field: string; message: string }[] = [];
        for (let i = 0; i < postCheck.errorMessages.length; i++) {
          retryErrors.push({
            field: postCheck.errorFields[i] || "不明",
            message: postCheck.errorMessages[i],
          });
        }
        for (const ve of visibleErrors) {
          retryErrors.push({
            field: ve.fieldName || "不明",
            message: ve.message,
          });
        }
        validationHistory.push({
          phase: `送信後リトライ${retry + 1}`,
          errors: retryErrors,
        });

        log(
          `📋 [送信後バリデーション] リトライ${retry + 1}/${MAX_VALIDATION_RETRIES}:`,
        );
        log(`  detectValidationErrors: ${postCheck.errorFields.length}件`);
        for (const msg of postCheck.errorMessages) {
          log(`    ⚠️ ${msg}`);
        }
        if (visibleErrors.length > 0) {
          log(`  ページ上の表示エラー: ${visibleErrors.length}件`);
          for (const err of visibleErrors) {
            log(
              `    ⚠️ フィールド: ${err.fieldName || "不明"} | エラー: "${err.message}"`,
            );
          }
        }

        // エラーフィールドを修正
        const allErrorFields = [...postCheck.errorFields];
        for (const ve of visibleErrors) {
          if (ve.fieldName && !allErrorFields.includes(ve.fieldName)) {
            allErrorFields.push(ve.fieldName);
          }
        }
        const fixedFields = await retryFillAfterValidation(
          currentForm,
          item.formData,
          allErrorFields,
        );
        if (fixedFields.length === 0) {
          log(`No fields could be fixed, stopping retry`);
          break;
        }
        log(`Fixed ${fixedFields.length} fields: ${fixedFields.join(", ")}`);
        await sleep(500);

        // 再送信
        const retrySubmit = await submitForm(currentForm);
        if (!retrySubmit.success) {
          log(`Retry submit failed: ${retrySubmit.error}`);
          return {
            success: false,
            error: `バリデーションエラー修正後も送信失敗 (リトライ${retry + 1}回): ${retrySubmit.error}`,
            debugLogs: getDebugLogs(),
            validationInfo:
              validationHistory.length > 0 ? validationHistory : undefined,
          };
        }
        log(`Retry submit ${retry + 1} completed`);
      }

      // 4. 成功ページの検出
      await waitForNavigation();

      // 成功ページチェック
      if (isSuccessPage()) {
        return {
          success: true,
          finalUrl: window.location.href,
          debugLogs: getDebugLogs(),
        };
      }

      // フォーム消失チェック（AJAXフォーム等で成功テキストなしでもフォームが消えれば成功の可能性大）
      const formStillExists = document.contains(form);
      const formVisible =
        formStillExists && (form as HTMLElement).offsetParent !== null;
      const formDisplayNone =
        formStillExists &&
        window.getComputedStyle(form as HTMLElement).display === "none";
      if (!formStillExists || !formVisible || formDisplayNone) {
        log(
          `✅ Form element disappeared or hidden after submit - likely successful (exists=${formStillExists}, visible=${formVisible})`,
        );
        return {
          success: true,
          finalUrl: window.location.href,
          debugLogs: getDebugLogs(),
        };
      }

      // submitForm が confirmed: true を返している場合は成功確定
      if (submitResult.confirmed) {
        return {
          success: true,
          finalUrl: window.location.href,
          debugLogs: getDebugLogs(),
        };
      }

      // 確認ページの場合、最終送信ボタンを探す
      const finalSubmitResult = await handleConfirmationPage();
      return {
        ...finalSubmitResult,
        debugLogs: getDebugLogs(),
        validationInfo:
          validationHistory.length > 0 ? validationHistory : undefined,
      };
    } catch (error) {
      // DOMExceptionの詳細情報を取得
      let errorMessage = `予期しないエラー: ${String(error)}`;
      if (error instanceof DOMException) {
        errorMessage = `DOMException: ${error.name} - ${error.message}`;
        log(
          `DOMException details: name=${error.name}, message=${error.message}`,
        );
      } else if (error instanceof Error) {
        errorMessage = `${error.name}: ${error.message}`;
        log(`Error details: ${error.name} - ${error.message}`);
      }

      console.error("[Apotto Content] Form submission error:", error);
      return {
        success: false,
        error: errorMessage,
        debugLogs: getDebugLogs(),
      };
    }
  }

  // デバッグ情報を収集
  function collectDebugInfo(): {
    url: string;
    title: string;
    formCount: number;
    inputCount: number;
    hasEmailField: boolean;
    hasTextarea: boolean;
    iframeCount: number;
    bodySnippet: string;
  } {
    const forms = document.querySelectorAll("form");
    const inputs = document.querySelectorAll('input:not([type="hidden"])');
    const emailField = document.querySelector(
      'input[type="email"], input[name*="mail" i]',
    );
    const textarea = document.querySelector("textarea");
    const iframes = document.querySelectorAll("iframe");

    return {
      url: window.location.href,
      title: document.title,
      formCount: forms.length,
      inputCount: inputs.length,
      hasEmailField: !!emailField,
      hasTextarea: !!textarea,
      iframeCount: iframes.length,
      bodySnippet:
        document.body.textContent?.substring(0, 500).replace(/\s+/g, " ") || "",
    };
  }

  // Background経由でナビゲーションしてフォームをチェック
  // 注意: ページ遷移はBackground Script側で管理されるため、navigateAndCheckは不要
  // 削除済み

  // ===== ページ種別判定（不適切フォーム除外） =====
  type PageExclusion =
    | { type: "hard_block"; reason: string }
    | { type: "soft_block"; reason: string }
    | { type: "allowed" };

  function classifyPageType(): PageExclusion {
    const title = document.title.toLowerCase();
    const url = window.location.href.toLowerCase();
    const urlPath = new URL(url).pathname.toLowerCase();

    // ページのタイトルとh1のみ（最も信頼性の高いコンテキスト）
    const h1Text = Array.from(document.querySelectorAll("h1"))
      .map((el) => el.textContent?.toLowerCase() || "")
      .join(" ");
    const titleAndH1 = `${title} ${h1Text}`;

    // お問い合わせページかどうか（最優先の判定軸）
    const isContactPage =
      /お問い合わせ|問い合わせ|contact|ご連絡|お問合せ|お問合わせ/.test(
        titleAndH1,
      ) || /\/contact|\/inquiry|\/toiawase|\/otoiawase/.test(urlPath);

    // お問い合わせページならブロックしない（URLやタイトルで明示的にcontactページ）
    if (isContactPage) {
      return { type: "allowed" };
    }

    // --- URLパターン判定（contactページ以外のみ） ---
    if (/\/download|\/whitepaper|\/document[-_]?request/i.test(urlPath))
      return { type: "hard_block", reason: "resource download URL" };
    if (/\/recruit|\/career|\/jobs?(?:\/|$)/i.test(urlPath))
      return { type: "hard_block", reason: "recruitment URL" };
    if (/\/ir(?:\/|$)|\/investor/i.test(urlPath))
      return { type: "hard_block", reason: "IR URL" };
    if (
      /\/estimate|\/trial|\/demo|\/quotation|\/quote|\/pricing/i.test(urlPath)
    )
      return { type: "soft_block", reason: "estimate/trial/demo URL" };

    // h1限定のコンテキスト（タイトル + h1のみ。h2/h3はナビやセクションタイトルが混入するため除外）
    const headingContext = titleAndH1;

    // --- Hard block: タイトルとh1のみで判定（h2/h3は含めない） ---
    if (
      /メルマガ登録|ニュースレター登録|newsletter\s*(sign|sub)/i.test(
        headingContext,
      )
    )
      return { type: "hard_block", reason: "newsletter signup page" };
    if (
      /^[^お問]*資料請求[^、]*$|^[^お問]*資料ダウンロード|^[^お問]*ホワイトペーパー/m.test(
        headingContext,
      )
    )
      return { type: "hard_block", reason: "resource request page" };
    if (
      /^[^お問]*(採用情報|求人情報|新卒採用|中途採用|キャリア)/m.test(
        headingContext,
      )
    )
      return { type: "hard_block", reason: "recruitment page" };
    if (/ir情報|株主.*向け|投資家.*向け/i.test(headingContext))
      return { type: "hard_block", reason: "IR/investor page" };

    return { type: "allowed" };
  }

  // ===== スコアリングベースの高度なフォーム検索 =====
  interface FormCandidate {
    element: Element;
    score: number;
    reasons: string[];
  }

  function findContactForm(): HTMLFormElement | null {
    // #region agent log
    const allForms = document.querySelectorAll("form");
    const allEmails = document.querySelectorAll(
      'input[type="email"], input[name*="mail" i]',
    );
    const allTextareas = document.querySelectorAll("textarea");
    const allSubmitButtons = document.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], a.btn, a.button, a[class*="submit"], a[class*="btn-primary"]',
    );
    fetch("http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "formHandler.ts:358",
        message: "findContactForm started",
        data: {
          totalForms: allForms.length,
          totalEmailInputs: allEmails.length,
          totalTextareas: allTextareas.length,
          totalButtons: allSubmitButtons.length,
          url: window.location.href,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "B",
      }),
    }).catch(() => {});
    // #endregion

    // ページ種別判定: hard_block / soft_block ならフォーム検索をスキップ
    const pageClassification = classifyPageType();
    if (pageClassification.type === "hard_block") {
      log(
        `Page excluded (hard_block): ${pageClassification.reason} - ${window.location.href}`,
      );
      return null;
    }
    if (pageClassification.type === "soft_block") {
      log(
        `Page excluded (soft_block): ${pageClassification.reason} - ${window.location.href}`,
      );
      return null;
    }

    const candidates: FormCandidate[] = [];

    // 1. フォームタグを持つ要素を評価
    const forms = document.querySelectorAll<HTMLFormElement>("form");
    for (const form of forms) {
      const result = scoreFormCandidate(form);
      if (result.score > 0) {
        candidates.push({ element: form, ...result });
      } else {
        // score=0 でも visible inputs が複数ある場合はデバッグ用にログ出力
        const visibleInputs = form.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
        );
        if (visibleInputs.length >= 3) {
          const sampleFields = Array.from(visibleInputs)
            .slice(0, 5)
            .map(
              (f) =>
                `${(f as HTMLInputElement).name || (f as HTMLInputElement).id || f.tagName}[${(f as HTMLInputElement).type || ""}]`,
            )
            .join(", ");
          log(
            `Form with ${visibleInputs.length} inputs scored 0 (reasons=[]): fields=[${sampleFields}]`,
          );
        }
      }
    }

    // 2. フォームタグがない場合、送信ボタンから逆引き
    if (candidates.length === 0) {
      log("No form tags found, searching via buttons...");
      const pseudoForms = findPseudoFormsViaButtons();
      for (const pf of pseudoForms) {
        const result = scoreFormCandidate(pf);
        if (result.score > 0) {
          candidates.push({ element: pf, ...result });
        }
      }
    }

    // 2.5. HubSpot/Marketo等の外部フォームサービスのコンテナを直接探す
    if (candidates.length === 0) {
      const externalFormContainers = document.querySelectorAll<HTMLElement>(
        '.hs-form, .hbspt-form, .mktoForm, [class*="hubspot-form"], [id*="hubspot-form"], [id*="hs_form"], [data-formid]',
      );
      for (const container of externalFormContainers) {
        const inputs = container.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
        );
        if (inputs.length >= 2) {
          log(
            `External form service container found with ${inputs.length} inputs: ${container.className}`,
          );
          const result = scoreFormCandidate(container);
          if (result.score > 0) {
            candidates.push({ element: container, ...result });
          } else {
            // 外部フォームサービスのコンテナなら最低スコアで候補に入れる
            candidates.push({
              element: container,
              score: 30,
              reasons: ["external form container (HubSpot/Marketo)"],
            });
          }
        }
      }
    }

    // 3. スコアでソートして最良の候補を選択
    candidates.sort((a, b) => b.score - a.score);

    // 動的スコア閾値: フォームの入力フィールド数に応じて調整
    const calculateMinScore = (element: Element, reasons: string[]): number => {
      const inputCount = element.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
      ).length;

      const hasContactAction = reasons.some(
        (r) => r.includes("form action") || r.includes("form id"),
      );
      if (hasContactAction && inputCount <= 3) return 20;

      const hasExternalForm = reasons.some((r) =>
        r.includes("external form service"),
      );
      if (hasExternalForm) return 30;

      if (inputCount <= 3) return 30;
      if (inputCount <= 6) return 40;
      return 50;
    };

    if (candidates.length > 0) {
      const best = candidates[0];
      const MIN_FORM_SCORE = calculateMinScore(best.element, best.reasons);
      log(
        `Best form candidate: score=${best.score}, threshold=${MIN_FORM_SCORE}, reasons=[${best.reasons.join(", ")}]`,
      );

      // スコアが閾値未満の場合は無視
      if (best.score < MIN_FORM_SCORE) {
        log(
          `Form score ${best.score} is below dynamic threshold ${MIN_FORM_SCORE}, ignoring`,
        );
        return null;
      }

      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/ae115290-0dc0-40f7-9966-129d981e7e81",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "formHandler.ts:450",
            message: "Form selected",
            data: {
              score: best.score,
              reasons: best.reasons,
              elementTag: best.element.tagName,
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "B",
          }),
        },
      ).catch(() => {});
      // #endregion
      return best.element as HTMLFormElement;
    }

    log("No suitable form found");
    return null;
  }

  // フォーム候補をスコアリング
  function scoreFormCandidate(container: Element): {
    score: number;
    reasons: string[];
  } {
    let score = 0;
    const reasons: string[] = [];

    // 1. 入力要素のカウント
    const inputs = container.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])',
    );
    const textareas = container.querySelectorAll("textarea");
    const selects = container.querySelectorAll("select");
    const totalInputs = inputs.length + textareas.length + selects.length;

    // 入力エリアが2つ未満のフォームはお問い合わせフォームとして成立しない
    // メルマガ登録（email 1つ）や空フォームを除外するための必須条件
    if (totalInputs < 2) {
      return { score: 0, reasons: [`SKIP: too few inputs (${totalInputs})`] };
    }

    if (totalInputs >= 5) {
      score += 40;
      reasons.push("5+ input fields");
    } else if (totalInputs >= 3) {
      score += 25;
      reasons.push("3+ input fields");
    } else if (totalInputs >= 2) {
      score += 10;
      reasons.push("2+ input fields");
    }

    // 2. メールフィールドの存在（最重要）
    const hasEmail = container.querySelector(
      'input[type="email"], input[name*="mail" i], input[name*="email" i], input[placeholder*="mail" i], input[placeholder*="email" i], input[autocomplete="email"]',
    );
    if (hasEmail) {
      score += 50;
      reasons.push("has email field");
    }

    // 3. テキストエリアの存在
    if (textareas.length > 0) {
      score += 30;
      reasons.push("has textarea");
    }

    // 4. 名前フィールドの存在
    const hasName = container.querySelector(
      'input[name*="name" i]:not([name*="company" i])',
    );
    if (hasName) {
      score += 20;
      reasons.push("has name field");
    }

    // 5. 電話番号フィールドの存在
    const hasPhone = container.querySelector(
      'input[type="tel"], input[name*="tel" i], input[name*="phone" i]',
    );
    if (hasPhone) {
      score += 15;
      reasons.push("has phone field");
    }

    // 6. 送信/確認ボタンの存在
    const formButtonKeywords = [
      "送信",
      "確認",
      "submit",
      "send",
      "confirm",
      "お問い合わせ",
      "問い合わせ",
      "同意",
      "申し込",
      "申込",
      "次へ",
      "入力内容",
      "apply",
      "register",
      "complete",
    ];
    const buttons = container.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], a.btn, a.button, a[class*="submit"], a[class*="btn-primary"]',
    );
    let hasFormButton = false;

    for (const btn of buttons) {
      const text = (
        btn.textContent ||
        (btn as HTMLInputElement).value ||
        ""
      ).toLowerCase();
      if (formButtonKeywords.some((kw) => text.includes(kw.toLowerCase()))) {
        hasFormButton = true;
        break;
      }
    }

    if (hasFormButton) {
      score += 35;
      reasons.push("has submit/confirm button");
    }

    // 7. プライバシー/同意チェックボックス
    const hasPrivacy = container.querySelector(
      'input[type="checkbox"][name*="privacy" i], input[type="checkbox"][name*="agree" i], input[type="checkbox"][name*="consent" i]',
    );
    if (hasPrivacy) {
      score += 10;
      reasons.push("has privacy checkbox");
    }

    // 8. 会社名フィールド
    const hasCompany = container.querySelector(
      'input[name*="company" i], input[name*="corp" i]',
    );
    if (hasCompany) {
      score += 15;
      reasons.push("has company field");
    }

    // 9. フォーム属性チェック
    if (container.tagName.toLowerCase() === "form") {
      const form = container as HTMLFormElement;
      if (form.action) {
        if (
          form.action.includes("contact") ||
          form.action.includes("inquiry") ||
          form.action.includes("mail")
        ) {
          score += 25;
          reasons.push("form action contains contact keywords");
        }
      }
      if (
        form.id &&
        (form.id.includes("contact") || form.id.includes("inquiry"))
      ) {
        score += 15;
        reasons.push("form id contains contact keywords");
      }
    }

    // 10. 周辺テキストの分析
    const nearbyText =
      container.textContent?.substring(0, 500).toLowerCase() || "";
    if (
      nearbyText.includes("お問い合わせ") ||
      nearbyText.includes("contact") ||
      nearbyText.includes("inquiry")
    ) {
      score += 10;
      reasons.push("nearby text contains contact keywords");
    }

    // 11-b. 外部フォームサービスの検出（HubSpot, Marketo, Pardot等）
    // ※ メルマガ文脈チェックより先に実行するが、後のペナルティで相殺される
    const externalFormSelectors = [
      ".hs-form",
      ".hbspt-form",
      '[class*="hubspot"]',
      ".mktoForm",
      '[class*="marketo"]',
      '[class*="pardot"]',
      ".typeform-widget",
      "[data-formid]",
      "[data-form-id]",
      "[data-portal-id]",
    ];
    let detectedExternalForm = false;
    let detectedExternalFormSel = "";
    for (const sel of externalFormSelectors) {
      if (container.matches(sel) || container.querySelector(sel)) {
        detectedExternalForm = true;
        detectedExternalFormSel = sel;
        break;
      }
    }

    // 11. 検索フォームの除外（マイナススコア）
    const isSearchForm =
      container.querySelector('input[type="search"]') !== null ||
      container.getAttribute("role") === "search" ||
      container.classList.contains("search") ||
      (container.tagName.toLowerCase() === "form" &&
        (container as HTMLFormElement).action.includes("search"));

    if (isSearchForm) {
      score -= 100;
      reasons.push("EXCLUDED: search form");
    }

    // 12. 不適切フォーム種別の検出
    // フォーム自身のテキスト(短め)で判定 + 直近の見出し + セクション全体のコンテキストを確認
    const formTextShort =
      container.textContent?.substring(0, 300).toLowerCase() || "";

    // セクション全体のコンテキストを取得（フォームの周囲4レベルまで遡る）
    let sectionContext = "";
    let ancestor: Element | null = container.parentElement;
    for (let i = 0; i < 4 && ancestor; i++) {
      // 祖先の直接テキストノードと見出し・段落を収集（フォーム自身を除く）
      const heading = ancestor.querySelector("h1, h2, h3, h4");
      if (heading && !container.contains(heading)) {
        sectionContext += " " + (heading.textContent?.toLowerCase() || "");
      }
      // 兄弟要素の短いテキストも確認（p, div などのラベルテキスト）
      let sibling = ancestor.firstElementChild;
      while (sibling) {
        if (!sibling.contains(container) && !container.contains(sibling)) {
          const sibText =
            sibling.textContent?.substring(0, 150).toLowerCase() || "";
          if (sibText) sectionContext += " " + sibText;
        }
        sibling = sibling.nextElementSibling;
      }
      ancestor = ancestor.parentElement;
      if (sectionContext.length > 500) break;
    }
    sectionContext = sectionContext.substring(0, 500);

    // 直近の見出し要素を取得（フォームの直前のh1-h4 + 親コンテナのh1-h4）
    let nearestHeading = "";
    let el: Element | null = container;
    for (let i = 0; i < 5 && el; i++) {
      el = el.previousElementSibling;
      if (el && /^h[1-4]$/i.test(el.tagName)) {
        nearestHeading = el.textContent?.toLowerCase() || "";
        break;
      }
    }
    if (!nearestHeading && container.parentElement) {
      const parentHeading =
        container.parentElement.querySelector("h1, h2, h3, h4");
      if (parentHeading && !container.contains(parentHeading)) {
        nearestHeading = parentHeading.textContent?.toLowerCase() || "";
      }
    }

    const formContext = `${formTextShort} ${nearestHeading} ${sectionContext}`;

    // フォーム自身のテキスト内に「お問い合わせ」が含まれるか（短いスコープで判定）
    const hasContactInForm = /お問い合わせ|問い合わせ|contact us|inquiry/.test(
      formTextShort,
    );

    // 12-a. email-onlyフォームは常に除外（メルマガの可能性が極めて高い）
    const emailOnlyForm =
      totalInputs <= 1 &&
      !!container.querySelector(
        'input[type="email"], input[name*="mail" i], input[name*="email" i]',
      );
    if (emailOnlyForm) {
      score -= 100;
      reasons.push("EXCLUDED: email-only form (likely newsletter)");
    }

    // 12-b. メルマガフォーム検出 (hard block: -100)
    const isNewsletterForm =
      /メルマガ|ニュースレター|newsletter|購読|subscribe|メール配信/.test(
        formContext,
      );
    if (isNewsletterForm && !emailOnlyForm) {
      score -= 100;
      reasons.push("EXCLUDED: newsletter form");
    }

    // 12-c. 資料請求フォーム検出 (hard block: -100)
    const isResourceForm =
      /資料請求|資料ダウンロード|ホワイトペーパー|whitepaper|お役立ち資料|無料ダウンロード/.test(
        formContext,
      );
    if (isResourceForm && !hasContactInForm) {
      score -= 100;
      reasons.push("EXCLUDED: resource request form");
    }

    // 12-d. 導入相談系フォーム検出 (soft block: -50)
    const isConsultationForm =
      /導入.*相談|導入.*検討|デモ申|デモリクエスト|見積.*依頼|トライアル申|無料体験/.test(
        formContext,
      );
    if (isConsultationForm && !hasContactInForm) {
      score -= 50;
      reasons.push("SOFT_BLOCK: consultation/demo form");
    }

    // 12-e. ボタンテキストによる補助判定
    for (const btn of buttons) {
      const btnText = (
        btn.textContent ||
        (btn as HTMLInputElement).value ||
        ""
      ).toLowerCase();
      if (/資料請求|ダウンロード|download/.test(btnText) && !hasContactInForm) {
        score -= 80;
        reasons.push("EXCLUDED: resource request button");
        break;
      }
    }

    // 11-b (続き). 外部フォームサービスのボーナス付与
    // メルマガ・資料請求・除外フォームでない場合のみ +40 を加算
    if (detectedExternalForm) {
      const isExcludedContext =
        emailOnlyForm || isNewsletterForm || isResourceForm;
      if (!isExcludedContext) {
        score += 40;
        reasons.push(
          `external form service detected: ${detectedExternalFormSel}`,
        );
      } else {
        reasons.push(
          `external form service found but excluded (newsletter/resource context): ${detectedExternalFormSel}`,
        );
      }
    }

    return { score, reasons };
  }

  // ボタンからフォームを逆引き
  function findPseudoFormsViaButtons(): Element[] {
    const pseudoForms: Element[] = [];
    const seen = new Set<Element>();

    const formButtonKeywords = [
      "送信",
      "確認",
      "submit",
      "send",
      "confirm",
      "お問い合わせ",
      "問い合わせ",
      "contact",
    ];
    const buttons = document.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], a.btn, a.button, a[class*="submit"], a[class*="btn-primary"], .hs-button, .mkto-button',
    );

    for (const btn of buttons) {
      const text = (
        btn.textContent ||
        (btn as HTMLInputElement).value ||
        ""
      ).toLowerCase();
      const btnClass = (btn.className || "").toLowerCase();
      const isFormButton =
        formButtonKeywords.some((kw) => text.includes(kw.toLowerCase())) ||
        /hs-button|mkto-button|submit/.test(btnClass);

      if (!isFormButton) continue;

      // ボタンの親要素を辿る
      let container = btn.parentElement;
      let depth = 0;

      while (container && container !== document.body && depth < 10) {
        if (seen.has(container)) {
          break;
        }

        const inputCount = container.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea',
        ).length;

        // 入力フィールドが2個以上あればフォーム候補
        if (inputCount >= 2) {
          pseudoForms.push(container);
          seen.add(container);
          log(
            `Found pseudo-form via button "${text.substring(0, 20)}" with ${inputCount} inputs`,
          );
          break;
        }

        container = container.parentElement;
        depth++;
      }
    }

    return pseudoForms;
  }

  // ラベルのテキストから対応する入力フィールドを探す
  function findFieldByLabel(
    container: Element,
    labelText: string,
    excludeTexts?: string[],
  ): HTMLInputElement | HTMLSelectElement | null {
    const labels = container.querySelectorAll<HTMLLabelElement>("label");

    for (const label of labels) {
      const text = label.textContent?.trim().toLowerCase() || "";
      const searchText = labelText.toLowerCase();

      if (text.includes(searchText) || searchText.includes(text)) {
        if (excludeTexts?.some((ex) => text.includes(ex.toLowerCase()))) {
          continue;
        }
        // 1. label の for 属性から input を探す
        const forAttr = label.getAttribute("for");
        if (forAttr) {
          const field = document.getElementById(forAttr) as
            | HTMLInputElement
            | HTMLSelectElement
            | null;
          if (field && container.contains(field)) {
            return field;
          }
        }

        // 2. label の子要素として input があるか探す
        const childField = label.querySelector<
          HTMLInputElement | HTMLSelectElement
        >("input, select");
        if (childField) {
          return childField;
        }

        // 3. label の次の要素を探す
        const nextElement = label.nextElementSibling;
        if (
          nextElement &&
          (nextElement.tagName === "INPUT" || nextElement.tagName === "SELECT")
        ) {
          return nextElement as HTMLInputElement | HTMLSelectElement;
        }

        // 4. label の親要素の次の兄弟要素内を探す（dt/dd パターン）
        const parent = label.closest("dt");
        if (parent) {
          const dd = parent.nextElementSibling;
          if (dd && dd.tagName === "DD") {
            const field = dd.querySelector<
              HTMLInputElement | HTMLSelectElement
            >("input, select");
            if (field) {
              return field;
            }
          }
        }
      }
    }

    return null;
  }

  // ラベルのテキストから対応する textarea を探す
  function findTextareaByLabel(
    container: Element,
    labelText: string,
  ): HTMLTextAreaElement | null {
    // すべてのラベルを検索
    const labels = container.querySelectorAll<HTMLLabelElement>("label");

    for (const label of labels) {
      const text = label.textContent?.trim().toLowerCase() || "";
      const searchText = labelText.toLowerCase();

      // ラベルのテキストが一致するか確認
      if (text.includes(searchText) || searchText.includes(text)) {
        // 1. label の for 属性から textarea を探す
        const forAttr = label.getAttribute("for");
        if (forAttr) {
          const field = document.getElementById(
            forAttr,
          ) as HTMLTextAreaElement | null;
          if (
            field &&
            field.tagName === "TEXTAREA" &&
            container.contains(field)
          ) {
            return field;
          }
        }

        // 2. label の子要素として textarea があるか探す
        const childField = label.querySelector<HTMLTextAreaElement>("textarea");
        if (childField) {
          return childField;
        }

        // 3. label の次の要素を探す
        const nextElement = label.nextElementSibling;
        if (nextElement && nextElement.tagName === "TEXTAREA") {
          return nextElement as HTMLTextAreaElement;
        }

        // 4. label の親要素の次の兄弟要素内を探す（dt/dd パターン）
        const parent = label.closest("dt");
        if (parent) {
          const dd = parent.nextElementSibling;
          if (dd && dd.tagName === "DD") {
            const field = dd.querySelector<HTMLTextAreaElement>("textarea");
            if (field) {
              return field;
            }
          }
        }
      }
    }

    return null;
  }

  // フォームに入力
  async function fillForm(
    form: HTMLFormElement | Element,
    data: FormData,
  ): Promise<void> {
    // ====== 分割フィールド事前検出 ======
    // メインマッピングより先に、分割された電話・名前・ふりがなフィールドを検出して入力する
    const preFilledElements = new Set<Element>();

    // --- 分割電話番号フィールド ---
    if (data.phone) {
      const allTelInputs = Array.from(
        form.querySelectorAll<HTMLInputElement>(
          'input[type="tel"], input[name*="tel" i], input[name*="phone" i], input[name*="denwa" i]',
        ),
      ).filter((f) => {
        const n = (f.name || f.id || "").toLowerCase();
        const p = (f.placeholder || "").toLowerCase();
        return !n.includes("fax") && !p.includes("fax") && !n.includes("fax");
      });
      const emptyTels = allTelInputs.filter(
        (f) => !f.value || f.value.trim() === "",
      );
      if (emptyTels.length >= 2 && emptyTels.length <= 4) {
        const digits = data.phone.replace(/[^\d]/g, "");
        let parts: string[];
        if (emptyTels.length === 3) {
          if (digits.length === 11) {
            parts = [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
          } else if (digits.length === 10) {
            parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
          } else {
            parts = data.phone.split("-");
          }
        } else if (emptyTels.length === 2) {
          const hyphenParts = data.phone.split("-");
          if (hyphenParts.length === 3) {
            parts = [hyphenParts[0], hyphenParts[1] + hyphenParts[2]];
          } else {
            parts = hyphenParts;
          }
        } else {
          parts = data.phone.split("-");
        }
        for (let i = 0; i < Math.min(emptyTels.length, parts.length); i++) {
          await fillField(emptyTels[i], parts[i]);
          preFilledElements.add(emptyTels[i]);
          log(
            `Pre-fill split phone[${i}]: ${emptyTels[i].name || emptyTels[i].id} = ${parts[i]}`,
          );
        }
      }
    }

    // --- 分割名前フィールド ---
    // 姓・名が分かれているが name 属性に sei/mei/last/first がないケースを検出
    if (data.lastName && data.firstName) {
      const nameInputs = Array.from(
        form.querySelectorAll<HTMLInputElement>(
          'input[name*="name" i]:not([name*="company" i]):not([name*="kana" i]):not([name*="mail" i]):not([name*="group" i]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
        ),
      ).filter((f) => !f.value || f.value.trim() === "");

      if (nameInputs.length >= 2) {
        // ラベルテキストで姓・名を判別
        let seiField: HTMLInputElement | null = null;
        let meiField: HTMLInputElement | null = null;
        for (const field of nameInputs) {
          const label = getFieldLabel(field);
          if (
            /^姓$|姓[\s（(]|last\s*name|family|苗字|sei/i.test(label) &&
            !seiField
          ) {
            seiField = field;
          } else if (
            /^名$|名[\s（(]|first\s*name|given|mei/i.test(label) &&
            !meiField
          ) {
            meiField = field;
          }
        }
        // ラベルで判別できない場合、順序で推定（日本語フォームは姓→名）
        if (!seiField && !meiField && nameInputs.length === 2) {
          seiField = nameInputs[0];
          meiField = nameInputs[1];
        }
        if (seiField && meiField) {
          await fillField(seiField, data.lastName);
          preFilledElements.add(seiField);
          log(
            `Pre-fill split name[sei]: ${seiField.name || seiField.id} = ${data.lastName}`,
          );
          await fillField(meiField, data.firstName);
          preFilledElements.add(meiField);
          log(
            `Pre-fill split name[mei]: ${meiField.name || meiField.id} = ${data.firstName}`,
          );
        }
      }
    }

    // --- 分割ふりがなフィールド ---
    if (data.lastNameKana && data.firstNameKana) {
      const kanaInputs = Array.from(
        form.querySelectorAll<HTMLInputElement>(
          'input[name*="kana" i], input[name*="furigana" i], input[name*="yomi" i], input[placeholder*="ふりがな" i], input[placeholder*="フリガナ" i], input[placeholder*="カナ" i], input[placeholder*="せい" i], input[placeholder*="めい" i], input[placeholder*="セイ" i], input[placeholder*="メイ" i]',
        ),
      ).filter(
        (f) => (!f.value || f.value.trim() === "") && !preFilledElements.has(f),
      );

      if (kanaInputs.length >= 2) {
        let seiKanaField: HTMLInputElement | null = null;
        let meiKanaField: HTMLInputElement | null = null;
        for (const field of kanaInputs) {
          const n = (field.name || field.id || "").toLowerCase();
          const label = getFieldLabel(field);
          const combined = n + " " + label;
          if (/sei|last|family|せい|セイ|姓/i.test(combined) && !seiKanaField) {
            seiKanaField = field;
          } else if (
            /mei|first|given|めい|メイ/i.test(combined) &&
            !meiKanaField
          ) {
            meiKanaField = field;
          }
        }
        if (!seiKanaField && !meiKanaField && kanaInputs.length === 2) {
          seiKanaField = kanaInputs[0];
          meiKanaField = kanaInputs[1];
        }
        if (seiKanaField && meiKanaField) {
          // fillField が detectKanaType を内部で呼んでひらがな/カタカナ変換を行うため、
          // data.lastNameKana（ひらがな想定）をそのまま渡せばよい
          await fillField(seiKanaField, data.lastNameKana);
          preFilledElements.add(seiKanaField);
          log(
            `Pre-fill split kana[sei]: ${seiKanaField.name || seiKanaField.id} = ${data.lastNameKana}`,
          );
          await fillField(meiKanaField, data.firstNameKana);
          preFilledElements.add(meiKanaField);
          log(
            `Pre-fill split kana[mei]: ${meiKanaField.name || meiKanaField.id} = ${data.firstNameKana}`,
          );
        }
      }
    }

    // ====== ヘルパー: フィールドのラベルテキストを取得 ======
    function getFieldLabel(field: HTMLInputElement): string {
      const labelEl = field.id
        ? document.querySelector<HTMLLabelElement>(
            `label[for="${CSS.escape(field.id)}"]`,
          )
        : null;
      const parentLabel = field.closest("label");
      const parentContainer = field.closest("div, p, td, th, dt, dd, li");
      return (
        labelEl?.textContent ||
        parentLabel?.textContent ||
        field.placeholder ||
        parentContainer?.textContent ||
        ""
      )
        .trim()
        .substring(0, 200);
    }

    // フィールドマッピング（サーバー側と同等に拡充）
    const fieldMappings: {
      value?: string;
      selectors: string[];
      labelTexts?: string[];
      excludeLabelTexts?: string[];
      isPostalCode?: boolean;
    }[] = [
      // 会社名
      {
        value: data.company,
        selectors: [
          'input[name*="company" i]',
          'input[name="groupname"]',
          'input[name*="corp" i]',
          'input[name*="organization" i]',
          'input[name*="group" i]',
          'input[name*="kaisha" i]',
          'input[name*="kigyou" i]',
          'input[placeholder*="会社" i]',
          'input[placeholder*="企業" i]',
          'input[placeholder*="法人" i]',
          'input[placeholder*="company" i]',
          'input[id*="company" i]',
          'input[id*="corp" i]',
          'input[id*="group" i]',
        ],
        labelTexts: [
          "会社名",
          "企業名",
          "法人名",
          "組織名",
          "御社名",
          "company",
        ],
      },
      // 名前（フルネーム）
      {
        value:
          data.name || `${data.lastName || ""} ${data.firstName || ""}`.trim(),
        selectors: [
          'input[name="name"]',
          'input[name="your-name"]',
          'input[name*="fullname" i]',
          'input[name*="your_name" i]',
          'input[name*="your-name" i]',
          'input[name*="shimei" i]',
          'input[name*="onamae" i]',
          'input[name*="name" i]:not([name*="company" i]):not([name*="kana" i]):not([name*="first" i]):not([name*="last" i]):not([name*="sei" i]):not([name*="mei" i]):not([name*="group" i])',
          'input[placeholder*="お名前" i]',
          'input[placeholder*="名前" i]',
          'input[placeholder*="氏名" i]',
          'input[placeholder*="フルネーム" i]',
          'input[id*="name" i]:not([id*="company" i]):not([id*="kana" i]):not([id*="group" i])',
          // 担当者名
          'input[name="cname"]',
          'input[name*="tantou" i]',
          'input[name*="contact_name" i]',
          'input[name*="contactname" i]',
          'input[name*="person" i]:not([name*="company" i])',
          'input[id*="cname" i]',
          'input[id*="tantou" i]',
        ],
        labelTexts: [
          "お名前",
          "名前",
          "氏名",
          "ご氏名",
          "ご担当者名",
          "お名前（漢字）",
          "担当者名",
          "ご担当者",
          "担当者",
          "name",
        ],
      },
      // 姓
      {
        value: data.lastName,
        selectors: [
          'input[name*="sei" i]:not([name*="kana" i])',
          'input[name*="lastname" i]',
          'input[name*="last_name" i]',
          'input[name*="family" i]',
          'input[name*="surname" i]',
          'input[name*="myoji" i]',
          'input[placeholder*="姓" i]:not([placeholder*="ふりがな" i])',
          'input[placeholder*="苗字" i]',
          'input[id*="sei" i]:not([id*="kana" i])',
          'input[id*="lastname" i]',
        ],
        labelTexts: ["姓", "苗字", "せい（漢字）", "セイ（漢字）"],
      },
      // 名
      {
        value: data.firstName,
        selectors: [
          'input[name*="mei" i]:not([name*="kana" i]):not([name*="mail" i])',
          'input[name*="firstname" i]',
          'input[name*="first_name" i]',
          'input[name*="given" i]',
          'input[placeholder*="名" i]:not([placeholder*="氏名" i]):not([placeholder*="ふりがな" i])',
          'input[id*="mei" i]:not([id*="kana" i])',
          'input[id*="firstname" i]',
        ],
        labelTexts: ["名", "めい（漢字）", "メイ（漢字）"],
      },
      // ふりがな（姓）
      {
        value: data.lastNameKana,
        selectors: [
          'input[name*="seikana" i]',
          'input[name*="sei_kana" i]',
          'input[name*="lastname_kana" i]',
          'input[name*="last_kana" i]',
          'input[name*="kana_sei" i]',
          'input[name*="furigana_sei" i]',
          'input[placeholder*="せい" i]',
          'input[placeholder*="セイ" i]',
          'input[id*="seikana" i]',
          'input[id*="lastname_kana" i]',
        ],
        labelTexts: [
          "せい",
          "セイ",
          "せい（ふりがな）",
          "セイ（フリガナ）",
          "せい（よみ）",
          "セイ（ヨミ）",
        ],
      },
      // ふりがな（名）
      {
        value: data.firstNameKana,
        selectors: [
          'input[name*="meikana" i]',
          'input[name*="mei_kana" i]',
          'input[name*="firstname_kana" i]',
          'input[name*="first_kana" i]',
          'input[name*="kana_mei" i]',
          'input[name*="furigana_mei" i]',
          'input[placeholder*="めい" i]',
          'input[placeholder*="メイ" i]',
          'input[id*="meikana" i]',
          'input[id*="firstname_kana" i]',
        ],
        labelTexts: [
          "めい",
          "メイ",
          "めい（ふりがな）",
          "メイ（フリガナ）",
          "めい（よみ）",
          "メイ（ヨミ）",
        ],
      },
      // ふりがな（フルネーム）
      {
        value:
          data.fullNameKana ||
          `${data.lastNameKana || ""} ${data.firstNameKana || ""}`.trim(),
        selectors: [
          'input[name*="kana" i]:not([name*="sei" i]):not([name*="mei" i]):not([name*="last" i]):not([name*="first" i])',
          'input[name*="furigana" i]:not([name*="sei" i]):not([name*="mei" i])',
          'input[name*="yomi" i]',
          'input[placeholder*="ふりがな" i]',
          'input[placeholder*="フリガナ" i]',
          'input[placeholder*="カナ" i]',
          'input[id*="kana" i]:not([id*="sei" i]):not([id*="mei" i])',
        ],
        labelTexts: [
          "フリガナ",
          "ふりがな",
          "カナ",
          "よみ",
          "お名前（ふりがな）",
          "お名前（カナ）",
        ],
      },
      // メールアドレス（メイン - 確認用より先に処理されるよう除外条件を強化）
      {
        value: data.email,
        selectors: [
          // 確認用フィールドを厳密に除外
          'input[type="email"]:not([name*="confirm" i]):not([name*="check" i]):not([name*="kakunin" i]):not([name*="re_" i]):not([name*="re-" i]):not([name$="2" i])',
          'input[name="email"]:not([name*="confirm" i]):not([name*="check" i]):not([name*="kakunin" i])',
          'input[name="mail"]:not([name*="confirm" i]):not([name*="check" i]):not([name*="kakunin" i])',
          'input[name*="email" i]:not([name*="confirm" i]):not([name*="check" i]):not([name*="kakunin" i]):not([name*="re_" i]):not([name*="re-" i]):not([name*="remail" i]):not([name$="2" i])',
          'input[name*="mail" i]:not([name*="confirm" i]):not([name*="check" i]):not([name*="kakunin" i]):not([name*="re_" i]):not([name*="re-" i]):not([name*="remail" i]):not([name$="2" i])',
          'input[placeholder*="メール" i]:not([placeholder*="確認" i]):not([placeholder*="再入力" i])',
          'input[placeholder*="mail" i]:not([placeholder*="確認" i]):not([placeholder*="再" i])',
          'input[placeholder*="email" i]:not([placeholder*="確認" i]):not([placeholder*="再" i])',
          'input[placeholder*="E-mail" i]:not([placeholder*="確認" i]):not([placeholder*="再" i])',
          'input[id*="email" i]:not([id*="confirm" i]):not([id*="check" i]):not([id*="kakunin" i]):not([id$="2" i])',
          'input[id*="mail" i]:not([id*="confirm" i]):not([id*="check" i]):not([id*="kakunin" i]):not([id$="2" i])',
        ],
        labelTexts: ["メールアドレス", "E-mail", "email", "mail"],
        excludeLabelTexts: [
          "確認",
          "再入力",
          "もう一度",
          "confirm",
          "check",
          "kakunin",
        ],
      },
      // メール確認（再入力・確認用）
      {
        value: data.email,
        selectors: [
          // 確認系
          'input[name*="email_check" i]',
          'input[name*="email_confirm" i]',
          'input[name*="mail_confirm" i]',
          'input[name*="mail_check" i]',
          'input[name*="confirm_email" i]',
          'input[name*="confirm_mail" i]',
          'input[name*="mailconfirm" i]',
          'input[name*="emailconfirm" i]',
          // 確認（日本語）
          'input[name*="kakunin" i]',
          'input[name*="mailkakunin" i]',
          'input[name*="emailkakunin" i]',
          // 再入力系
          'input[name*="re_email" i]',
          'input[name*="re_mail" i]',
          'input[name*="remail" i]',
          'input[name*="reemail" i]',
          'input[name*="reenter" i]',
          'input[name*="reinput" i]',
          'input[name*="sainyuryoku" i]',
          // 連番系
          'input[name*="email2" i]',
          'input[name*="mail2" i]',
          'input[name*="email-2" i]',
          'input[name*="mail-2" i]',
          // プレースホルダー
          'input[placeholder*="確認" i]',
          'input[placeholder*="再入力" i]',
          'input[placeholder*="もう一度" i]',
          // ID系
          'input[id*="email_confirm" i]',
          'input[id*="mail_confirm" i]',
          'input[id*="mailkakunin" i]',
          'input[id*="email2" i]',
          'input[id*="mail2" i]',
        ],
        labelTexts: [
          "メールアドレス確認",
          "メールアドレス再入力",
          "メール再入力",
          "確認用メール",
          "確認用",
          "再入力",
          "もう一度",
          "メールアドレス（確認）",
          "メールアドレス(確認)",
          "E-mail（確認）",
          "E-mail(確認)",
          "メール（確認用）",
          "メール(確認用)",
        ],
      },
      // 電話番号
      {
        value: data.phone,
        selectors: [
          'input[type="tel"]',
          'input[name*="tel" i]',
          'input[name*="phone" i]',
          'input[name*="denwa" i]',
          'input[placeholder*="電話" i]',
          'input[placeholder*="TEL" i]',
          'input[placeholder*="Phone" i]',
          'input[id*="tel" i]',
          'input[id*="phone" i]',
        ],
        labelTexts: [
          "お電話番号",
          "電話番号",
          "TEL",
          "連絡先",
          "ご連絡先",
          "phone",
        ],
      },
      // 郵便番号
      {
        value: data.postalCode,
        selectors: [
          'input[name*="zip" i]',
          'input[name*="postal" i]',
          'input[name*="postcode" i]',
          'input[name*="yubin" i]',
          'input[placeholder*="郵便" i]',
          'input[placeholder*="〒" i]',
          'input[id*="zip" i]',
          'input[id*="postal" i]',
        ],
        labelTexts: ["郵便番号", "〒"],
        isPostalCode: true,
      },
      // 都道府県
      {
        value: data.prefecture,
        selectors: [
          'select[name*="pref" i]',
          'select[name*="ken" i]',
          'select[name*="todofuken" i]',
          'select[name*="state" i]',
          'input[name*="pref" i]',
          'input[name*="ken" i]',
          'input[placeholder*="都道府県" i]',
          'select[id*="pref" i]',
          'select[id*="ken" i]',
        ],
        labelTexts: ["都道府県", "ご住所"],
      },
      // 市区町村
      {
        value: data.city,
        selectors: [
          'input[name*="city" i]',
          'input[name*="shiku" i]',
          'input[name*="address1" i]',
          'input[placeholder*="市区町村" i]',
          'input[id*="city" i]',
        ],
        labelTexts: ["市区町村"],
      },
      // 住所
      {
        value: data.address,
        selectors: [
          'input[name*="address" i]:not([name*="mail" i]):not([name*="address1" i])',
          'input[name*="jusho" i]',
          'input[name*="address2" i]',
          'input[name*="street" i]',
          'input[placeholder*="住所" i]',
          'input[placeholder*="番地" i]',
          'input[id*="address" i]:not([id*="mail" i])',
        ],
        labelTexts: ["住所", "ご住所", "所在地", "address"],
      },
      // 部署
      {
        value: data.department,
        selectors: [
          'input[name="section"]',
          'input[name*="depart" i]',
          'input[name*="busho" i]',
          'input[name*="division" i]',
          'input[name*="section" i]',
          'input[name*="bu" i]:not([name*="submit" i]):not([name*="button" i])',
          'input[placeholder*="部署" i]',
          'input[placeholder*="所属" i]',
          'input[id*="depart" i]',
          'input[id*="busho" i]',
          'input[id*="section" i]',
        ],
        labelTexts: ["部署名", "部署", "所属", "所属部署"],
      },
      // 役職
      {
        value: data.title,
        selectors: [
          'input[name*="title" i]:not([name*="subtitle" i])',
          'input[name*="yakushoku" i]',
          'input[name*="position" i]',
          'input[name*="post" i]',
          'input[placeholder*="役職" i]',
          'input[id*="title" i]',
          'input[id*="position" i]',
        ],
      },
      // 件名
      {
        value: data.subject,
        selectors: [
          'input[name*="subject" i]',
          'input[name*="title" i]',
          'input[name*="kenmei" i]',
          'input[placeholder*="件名" i]',
          'input[placeholder*="タイトル" i]',
          'input[id*="subject" i]',
        ],
      },
      // 従業員数
      {
        value: "100",
        selectors: [
          'input[name*="employee" i]',
          'input[name*="jugyoin" i]',
          'input[name*="shain" i]',
          'input[name*="staff" i]',
          'input[placeholder*="従業員" i]',
          'input[placeholder*="社員数" i]',
          'input[id*="employee" i]',
        ],
        labelTexts: ["従業員数", "社員数", "従業員", "employees"],
      },
      // 売上・年商
      {
        value: "10億円以上",
        selectors: [
          'input[name*="revenue" i]',
          'input[name*="uriage" i]',
          'input[name*="nensho" i]',
          'input[placeholder*="売上" i]',
          'input[placeholder*="年商" i]',
          'input[id*="revenue" i]',
        ],
        labelTexts: ["売上", "年商", "revenue"],
      },
    ];

    // 各フィールドに入力（事前入力済みフィールドはスキップ）
    for (const mapping of fieldMappings) {
      if (!mapping.value) continue;

      let filled = false;

      // 1. セレクターで検索
      for (const selector of mapping.selectors) {
        try {
          const field = form.querySelector<
            HTMLInputElement | HTMLSelectElement
          >(selector);
          if (field && preFilledElements.has(field)) {
            filled = true;
            break;
          }
          if (field && !field.value) {
            await fillField(field, mapping.value);
            log(`Filled: ${selector} = ${mapping.value.substring(0, 20)}...`);
            filled = true;
            break;
          }
        } catch {
          // セレクタが無効な場合はスキップ
        }
      }

      // 2. ラベルテキストで検索
      if (!filled && mapping.labelTexts) {
        for (const labelText of mapping.labelTexts) {
          const field = findFieldByLabel(
            form,
            labelText,
            mapping.excludeLabelTexts,
          );
          if (field && preFilledElements.has(field)) {
            filled = true;
            break;
          }
          if (field && !field.value) {
            await fillField(field, mapping.value);
            log(
              `Filled via label "${labelText}": ${field.name || field.id} = ${mapping.value.substring(0, 20)}...`,
            );
            filled = true;
            break;
          }
        }
      }

      // 郵便番号入力後は住所自動補完を待機
      if (filled && mapping.isPostalCode) {
        log("Postal code filled, waiting 1s for address auto-complete...");
        await sleep(1000);
      }
    }

    // メッセージ（textarea）
    if (data.message) {
      const textareaSelectors = [
        'textarea[name*="message" i]',
        'textarea[name*="body" i]',
        'textarea[name*="content" i]',
        'textarea[name*="inquiry" i]',
        'textarea[name*="comment" i]',
        'textarea[name*="naiyou" i]',
        'textarea[name*="detail" i]',
        'textarea[placeholder*="お問い合わせ" i]',
        'textarea[placeholder*="内容" i]',
        'textarea[placeholder*="メッセージ" i]',
        'textarea[id*="message" i]',
        'textarea[id*="content" i]',
        "textarea",
      ];

      let textareaFilled = false;

      // 1. セレクターで検索
      for (const selector of textareaSelectors) {
        const textarea = form.querySelector<HTMLTextAreaElement>(selector);
        if (textarea) {
          await fillField(textarea, data.message);
          log(`Filled textarea: ${selector}`);
          textareaFilled = true;
          break;
        }
      }

      // 2. ラベルテキストで検索
      if (!textareaFilled) {
        const labelTexts = [
          "お問い合わせ内容",
          "お問合せ内容",
          "お問い合わせ",
          "問い合わせ内容",
          "ご相談内容",
          "メッセージ",
          "内容",
          "ご意見",
          "ご質問",
        ];
        for (const labelText of labelTexts) {
          const textarea = findTextareaByLabel(form, labelText);
          if (textarea) {
            await fillField(textarea, data.message);
            log(
              `Filled textarea via label "${labelText}": ${textarea.name || textarea.id}`,
            );
            break;
          }
        }
      }
    }

    // 全ての空のvisible inputに対してラベルベースで入力を試みる（残りの未入力フィールド対応）
    const allVisibleInputs = form.querySelectorAll<HTMLInputElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])',
    );
    for (const field of allVisibleInputs) {
      if (field.value && field.value.trim() !== "") continue;
      if (
        field.offsetParent === null &&
        window.getComputedStyle(field).display === "none"
      )
        continue;

      const labelEl = field.id
        ? document.querySelector<HTMLLabelElement>(
            `label[for="${CSS.escape(field.id)}"]`,
          )
        : null;
      const parentLabel = field.closest("label");
      const parentContainer = field.closest("div, p, td, th, dt, dd, li");
      const labelText = (
        labelEl?.textContent ||
        parentLabel?.textContent ||
        parentContainer?.textContent ||
        ""
      )
        .trim()
        .substring(0, 200);

      let valueToFill = "";
      if (
        /電話|TEL|phone/i.test(labelText) &&
        !/FAX|ファックス/i.test(labelText)
      ) {
        valueToFill = data.phone || "";
      } else if (/会社|企業|法人|組織|corporation|company/i.test(labelText)) {
        valueToFill = data.company || "";
      } else if (
        /メール|e-?mail/i.test(labelText) &&
        !/確認|再入力/i.test(labelText)
      ) {
        valueToFill = data.email || "";
      } else if (
        /お名前|氏名|担当者名|name/i.test(labelText) &&
        !/会社|法人|企業/i.test(labelText)
      ) {
        valueToFill =
          data.name || `${data.lastName || ""} ${data.firstName || ""}`.trim();
      } else if (/従業員|社員数|employee|staff/i.test(labelText)) {
        valueToFill = "100";
      } else if (/売上|年商|revenue/i.test(labelText)) {
        valueToFill = "10億円以上";
      }

      if (valueToFill) {
        await fillField(field, valueToFill);
        log(
          `Filled via label fallback: "${labelText.substring(0, 30)}" → ${field.name || field.id} = ${valueToFill.substring(0, 20)}...`,
        );
      }
    }

    // チェックボックスの処理
    // 1. 選択式チェックボックス（お問い合わせ内容など）：最初の項目を選択
    const checkboxGroups = new Set<string>();
    const allCheckboxes = form.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );

    for (const checkbox of allCheckboxes) {
      // name[]形式のチェックボックスをグループとして認識
      const name = checkbox.name;
      if (name && name.includes("[]")) {
        const groupName = name.replace("[]", "");
        checkboxGroups.add(groupName);
      }
    }

    for (const groupName of checkboxGroups) {
      const escapedGroupFieldName = CSS.escape(`${groupName}[]`);
      const groupCheckboxes = form.querySelectorAll<HTMLInputElement>(
        `input[type="checkbox"][name="${escapedGroupFieldName}"]`,
      );

      const anyChecked = Array.from(groupCheckboxes).some((cb) => cb.checked);

      if (!anyChecked && groupCheckboxes.length > 0) {
        const cbArr = Array.from(groupCheckboxes);
        const getLabel = (cb: HTMLInputElement): string =>
          (
            cb.closest("label")?.textContent?.trim() ||
            cb.value ||
            ""
          ).toLowerCase();

        // 優先キーワードに一致するオプションを探す
        const preferred = cbArr.find((cb) => {
          const lbl = getLabel(cb);
          return PREFERRED_OPTION_KEYWORDS.some((kw) =>
            lbl.includes(kw.toLowerCase()),
          );
        });
        const target =
          preferred ||
          cbArr.find((cb) => {
            const lbl = getLabel(cb);
            return !AVOID_OPTION_KEYWORDS.some((kw) =>
              lbl.includes(kw.toLowerCase()),
            );
          }) ||
          cbArr[0];

        target.click();
        const label =
          target.closest("label")?.textContent?.trim() || target.value;
        log(
          `Checked checkbox in group "${groupName}": ${label}${preferred ? " (preferred)" : ""}`,
        );
        await sleep(100);
      }
    }

    // 2. 必須チェックボックス（同意など）にチェック
    const requiredCheckboxSelectors = [
      'input[type="checkbox"][required]',
      'input[type="checkbox"][aria-required="true"]',
      'input[type="checkbox"][name*="agree" i]',
      'input[type="checkbox"][name*="privacy" i]',
      'input[type="checkbox"][name*="consent" i]',
      'input[type="checkbox"][name*="terms" i]',
      'input[type="checkbox"][name*="policy" i]',
      'input[type="checkbox"][name*="doui" i]',
      'input[type="checkbox"][name*="kojin" i]',
      'input[type="checkbox"][name*="accept" i]',
      'input[type="checkbox"][name*="check" i]:not([name*="checkbox_group" i])',
      'input[type="checkbox"][id*="agree" i]',
      'input[type="checkbox"][id*="privacy" i]',
      'input[type="checkbox"][id*="consent" i]',
      'input[type="checkbox"][id*="accept" i]',
      'input[type="checkbox"][id*="terms" i]',
    ];

    const checkedBySelector = new Set<HTMLInputElement>();
    for (const selector of requiredCheckboxSelectors) {
      const checkboxes = form.querySelectorAll<HTMLInputElement>(selector);
      for (const checkbox of checkboxes) {
        if (!checkbox.checked) {
          if (checkbox.disabled) {
            log(`Checkbox is disabled, attempting to enable by scrolling...`);
            const enabled = await enableCheckboxByScrolling(checkbox);
            if (!enabled) {
              log(`Failed to enable checkbox by scrolling, skipping...`);
              continue;
            }
            log(`Checkbox enabled successfully after scrolling`);
          }

          checkbox.click();
          checkedBySelector.add(checkbox);
          log(`Checked required checkbox: ${selector}`);
          await sleep(50);
        }
      }
    }

    // 3. ラベルテキストベースの同意チェックボックス検出
    const agreeLabelKeywords = [
      "同意",
      "個人情報",
      "プライバシー",
      "利用規約",
      "取扱い",
      "取り扱い",
      "承諾",
      "了承",
      "agree",
      "privacy",
      "consent",
      "terms",
    ];
    const uncheckedCheckboxes = form.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]:not(:checked)',
    );
    for (const checkbox of uncheckedCheckboxes) {
      if (checkedBySelector.has(checkbox)) continue;
      // ラベルテキストを取得（label要素、親要素、隣接テキスト）
      const labelEl = checkbox.id
        ? document.querySelector<HTMLLabelElement>(
            `label[for="${CSS.escape(checkbox.id)}"]`,
          )
        : null;
      const parentLabel = checkbox.closest("label");
      const parentContainer = checkbox.closest("div, p, span, li, td");
      const labelText = (
        labelEl?.textContent ||
        parentLabel?.textContent ||
        parentContainer?.textContent ||
        ""
      )
        .trim()
        .toLowerCase();

      if (
        agreeLabelKeywords.some((kw) => labelText.includes(kw.toLowerCase()))
      ) {
        if (checkbox.disabled) {
          const enabled = await enableCheckboxByScrolling(checkbox);
          if (!enabled) continue;
        }
        checkbox.click();
        log(
          `Checked agreement checkbox by label: "${labelText.substring(0, 50)}..."`,
        );
        await sleep(50);
      }
    }

    // 4. ドキュメント全体からフォーム外の同意チェックボックスも検出
    const formElement = form as HTMLFormElement;
    const allDocCheckboxes = document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]:not(:checked)',
    );
    for (const checkbox of allDocCheckboxes) {
      if (formElement.contains(checkbox)) continue;
      const labelEl = checkbox.id
        ? document.querySelector<HTMLLabelElement>(
            `label[for="${CSS.escape(checkbox.id)}"]`,
          )
        : null;
      const parentLabel = checkbox.closest("label");
      const parentContainer = checkbox.closest("div, p, span, li, td");
      const labelText = (
        labelEl?.textContent ||
        parentLabel?.textContent ||
        parentContainer?.textContent ||
        ""
      )
        .trim()
        .toLowerCase();

      if (
        agreeLabelKeywords.some((kw) => labelText.includes(kw.toLowerCase()))
      ) {
        if (checkbox.disabled) {
          const enabled = await enableCheckboxByScrolling(checkbox);
          if (!enabled) continue;
        }
        checkbox.click();
        log(
          `Checked agreement checkbox outside form: "${labelText.substring(0, 50)}..."`,
        );
        await sleep(50);
      }
    }

    // セレクトボックスの処理（未選択のものに最初の有効なオプションを選択）
    // React等のフレームワーク対応: nativeSelectValueSetterを使用
    const nativeSelectSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;

    const selects = form.querySelectorAll<HTMLSelectElement>(
      "select:not([disabled])",
    );
    for (const select of selects) {
      if (!select.value || select.value === "") {
        const options = select.querySelectorAll("option");
        for (const option of options) {
          // 空・placeholder・「選択してください」系を除外
          const optText = option.textContent?.trim().toLowerCase() || "";
          const isPlaceholder =
            !option.value ||
            option.value === "" ||
            optText.includes("選択") ||
            optText.includes("select") ||
            optText === "-" ||
            optText === "--";

          if (!isPlaceholder && !option.disabled) {
            // React対応: nativeSetterで値を設定
            if (nativeSelectSetter) {
              nativeSelectSetter.call(select, option.value);
            } else {
              select.value = option.value;
            }
            select.dispatchEvent(new Event("change", { bubbles: true }));
            select.dispatchEvent(new Event("input", { bubbles: true }));
            log(
              `Selected option: ${option.value} (${option.textContent?.trim()})`,
            );
            await sleep(50);
            break;
          }
        }
      }
    }

    // ラジオボタンの処理（必須で未選択のものを選択）
    const radioGroups = new Set<string>();
    const radios = form.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );
    for (const radio of radios) {
      if (radio.name) radioGroups.add(radio.name);
    }

    for (const groupName of radioGroups) {
      const escapedGroupName = CSS.escape(groupName);
      const groupRadios = form.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${escapedGroupName}"]`,
      );
      const anyChecked = Array.from(groupRadios).some((r) => r.checked);

      if (!anyChecked && groupRadios.length > 0) {
        const radioArr = Array.from(groupRadios);

        const getLabel = (r: HTMLInputElement): string =>
          (
            r.closest("label")?.textContent?.trim() ||
            r.value ||
            ""
          ).toLowerCase();

        // 優先キーワードに一致するオプションを探す
        const preferred = radioArr.find((r) => {
          const lbl = getLabel(r);
          return PREFERRED_OPTION_KEYWORDS.some((kw) =>
            lbl.includes(kw.toLowerCase()),
          );
        });
        if (preferred) {
          preferred.click();
          log(`Selected preferred radio: ${groupName} = ${preferred.value}`);
          await sleep(100);
          continue;
        }

        // 回避キーワードを除いた最初のオプションを選択
        const safe = radioArr.find((r) => {
          const lbl = getLabel(r);
          return !AVOID_OPTION_KEYWORDS.some((kw) =>
            lbl.includes(kw.toLowerCase()),
          );
        });
        if (safe) {
          safe.click();
          log(`Selected safe radio: ${groupName} = ${safe.value}`);
        } else if (radioArr.length > 0) {
          radioArr[0].click();
          log(
            `Selected first radio (no safe option): ${groupName} = ${radioArr[0].value}`,
          );
        }
        await sleep(100);
      }
    }
  }

  /**
   * バリデーションエラーを検出する
   * フォーム送信後にエラーメッセージが表示されているかチェック
   */
  function detectValidationErrors(form: HTMLFormElement | Element): {
    hasErrors: boolean;
    errorFields: string[];
    errorMessages: string[];
  } {
    const errorFields: string[] = [];
    const errorMessages: string[] = [];

    // 1. エラーメッセージ要素の検出（一般的なCSSクラス/属性パターン）
    const errorSelectors = [
      '.error:not([style*="display: none"]):not([style*="display:none"])',
      '.is-error:not([style*="display: none"])',
      '.has-error:not([style*="display: none"])',
      '.field-error:not([style*="display: none"])',
      '.form-error:not([style*="display: none"])',
      '.validation-error:not([style*="display: none"])',
      '.invalid-feedback:not([style*="display: none"])',
      '.error-message:not([style*="display: none"])',
      '.err-msg:not([style*="display: none"])',
      '[role="alert"]',
      ".wpcf7-not-valid-tip",
      ".mw_wp_form_error",
    ];

    const scope = form as Element;
    for (const selector of errorSelectors) {
      try {
        const errorEls = scope.querySelectorAll(selector);
        for (const el of errorEls) {
          const htmlEl = el as HTMLElement;
          if (htmlEl.offsetParent === null && !htmlEl.closest('[role="alert"]'))
            continue;
          const text = htmlEl.textContent?.trim() || "";
          if (text && text.length > 0 && text.length < 200) {
            errorMessages.push(text);
            const parentField = htmlEl.closest(
              ".form-group, .form-item, .field, .form-field, div",
            );
            if (parentField) {
              const input = parentField.querySelector<
                HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
              >("input, select, textarea");
              if (input) {
                errorFields.push(input.name || input.id || input.type);
              }
            }
          }
        }
      } catch {
        // ignore invalid selectors
      }
    }

    // 2. aria-invalid="true" のフィールドを検出
    const invalidInputs = scope.querySelectorAll<HTMLInputElement>(
      '[aria-invalid="true"]',
    );
    for (const input of invalidInputs) {
      const name = input.name || input.id || input.type;
      if (!errorFields.includes(name)) {
        errorFields.push(name);
      }
    }

    // 3. :invalid 疑似クラス（HTML5 バリデーション）
    const html5InvalidInputs = scope.querySelectorAll<HTMLInputElement>(
      "input:invalid, select:invalid, textarea:invalid",
    );
    for (const input of html5InvalidInputs) {
      if (input.type === "hidden") continue;
      const name = input.name || input.id || input.type;
      if (!errorFields.includes(name)) {
        errorFields.push(name);
        if (input.validationMessage) {
          errorMessages.push(`${name}: ${input.validationMessage}`);
        }
      }
    }

    // 4. 必須フィールドが空のままかチェック
    const requiredFields = scope.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("[required], [aria-required='true']");
    for (const field of requiredFields) {
      if (
        field.type === "hidden" ||
        field.type === "checkbox" ||
        field.type === "radio"
      )
        continue;
      if (!field.value || field.value.trim() === "") {
        const name = field.name || field.id || field.type;
        if (!errorFields.includes(name)) {
          errorFields.push(name);
          errorMessages.push(`必須項目未入力: ${name}`);
        }
      }
    }

    // 5. 必須チェックボックスが未チェック
    const requiredCheckboxes = scope.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][required]:not(:checked), input[type="checkbox"][aria-required="true"]:not(:checked)',
    );
    for (const cb of requiredCheckboxes) {
      const name = cb.name || cb.id || "checkbox";
      if (!errorFields.includes(name)) {
        errorFields.push(name);
        errorMessages.push(`チェックボックス未チェック: ${name}`);
      }
    }

    // 6. 未選択のselectで required なもの
    const requiredSelects =
      scope.querySelectorAll<HTMLSelectElement>("select[required]");
    for (const sel of requiredSelects) {
      if (!sel.value || sel.value === "") {
        const name = sel.name || sel.id || "select";
        if (!errorFields.includes(name)) {
          errorFields.push(name);
          errorMessages.push(`選択必須項目未選択: ${name}`);
        }
      }
    }

    const hasErrors = errorFields.length > 0 || errorMessages.length > 0;
    return { hasErrors, errorFields, errorMessages };
  }

  /**
   * ページ上に表示されているバリデーションエラーを能動的にスキャンする。
   * 「〜は必須です」「入力してください」等のエラーテキストを持つ要素を探し、
   * 近隣のフィールドと紐づけて返す。
   */
  function scanVisibleValidationErrors(form: HTMLFormElement | Element): {
    message: string;
    fieldName: string | null;
    fieldSelector: string | null;
  }[] {
    const results: {
      message: string;
      fieldName: string | null;
      fieldSelector: string | null;
    }[] = [];
    const scope = form as Element;

    const errorPatterns =
      /必須|入力してください|正しく入力|有効な|形式が|不正|選択してください|半角|全角|一致しません|文字以上|文字以下|確認.*一致|required|invalid|please enter|please select|is required|must be/i;

    // 1. 一般的なエラー要素のセレクタ
    const errorSelectors = [
      ".error",
      ".is-error",
      ".has-error",
      ".field-error",
      ".form-error",
      ".validation-error",
      ".invalid-feedback",
      ".error-message",
      ".err-msg",
      ".wpcf7-not-valid-tip",
      ".mw_wp_form_error",
      '[role="alert"]',
      ".error-text",
      ".help-block.error",
      ".parsley-errors-list li",
      ".form-error-message",
      ".error_message",
      ".errMsg",
      "span.error",
      "p.error",
      "div.error",
      "label.error",
    ];

    for (const selector of errorSelectors) {
      try {
        const els = scope.querySelectorAll(selector);
        for (const el of els) {
          const htmlEl = el as HTMLElement;
          if (htmlEl.offsetParent === null && !htmlEl.closest('[role="alert"]'))
            continue;
          const text = htmlEl.textContent?.trim() || "";
          if (!text || text.length === 0 || text.length > 300) continue;
          if (results.some((r) => r.message === text)) continue;

          const { fieldName, fieldSelector } = findNearestField(htmlEl, scope);
          results.push({ message: text, fieldName, fieldSelector });
        }
      } catch {
        /* ignore */
      }
    }

    // 2. テキスト内容でエラーパターンにマッチする要素を追加スキャン
    const allSmallText = scope.querySelectorAll(
      "span, p, div, label, li, small, em",
    );
    for (const el of allSmallText) {
      const htmlEl = el as HTMLElement;
      if (htmlEl.offsetParent === null) continue;
      const text = htmlEl.textContent?.trim() || "";
      if (!text || text.length < 3 || text.length > 300) continue;
      if (results.some((r) => r.message === text)) continue;

      // 赤色テキストまたはエラーパターンマッチ
      const style = window.getComputedStyle(htmlEl);
      const isRedish =
        style.color.includes("255") || style.color.includes("rgb(2");
      const hasErrorClass =
        htmlEl.className && /error|invalid|warn|alert/i.test(htmlEl.className);

      if ((isRedish || hasErrorClass) && errorPatterns.test(text)) {
        const { fieldName, fieldSelector } = findNearestField(htmlEl, scope);
        results.push({ message: text, fieldName, fieldSelector });
      }
    }

    return results;
  }

  /**
   * エラー要素に最も近いフォームフィールドを探す
   */
  function findNearestField(
    errorEl: HTMLElement,
    _scope: Element,
  ): { fieldName: string | null; fieldSelector: string | null } {
    // 親コンテナ内のinputを探す
    const containers = [
      errorEl.closest(".form-group"),
      errorEl.closest(".form-item"),
      errorEl.closest(".form-field"),
      errorEl.closest(".field"),
      errorEl.closest("tr"),
      errorEl.closest("dd"),
      errorEl.closest("li"),
      errorEl.parentElement,
      errorEl.parentElement?.parentElement,
    ];

    for (const container of containers) {
      if (!container) continue;
      const input = container.querySelector<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >(
        "input:not([type='hidden']):not([type='submit']):not([type='button']), select, textarea",
      );
      if (input) {
        const name = input.name || input.id || input.type;
        const selector = input.name
          ? `[name="${CSS.escape(input.name)}"]`
          : input.id
            ? `#${CSS.escape(input.id)}`
            : null;
        return { fieldName: name, fieldSelector: selector };
      }
    }

    // for 属性で参照されている場合
    const labelFor = errorEl.closest("label")?.getAttribute("for");
    if (labelFor) {
      const input = document.getElementById(
        labelFor,
      ) as HTMLInputElement | null;
      if (input) {
        return {
          fieldName: input.name || input.id || input.type,
          fieldSelector: `#${CSS.escape(labelFor)}`,
        };
      }
    }

    // 直前の兄弟要素を確認
    const prevSibling = errorEl.previousElementSibling as HTMLElement | null;
    if (
      prevSibling &&
      (prevSibling.tagName === "INPUT" ||
        prevSibling.tagName === "SELECT" ||
        prevSibling.tagName === "TEXTAREA")
    ) {
      const input = prevSibling as HTMLInputElement;
      return {
        fieldName: input.name || input.id || input.type,
        fieldSelector: input.name ? `[name="${CSS.escape(input.name)}"]` : null,
      };
    }

    return { fieldName: null, fieldSelector: null };
  }

  /**
   * バリデーションエラーに基づいてフォームを再入力する
   * 未入力の必須フィールドを埋め、未チェックのチェックボックスにチェックを入れる
   */
  async function retryFillAfterValidation(
    form: HTMLFormElement | Element,
    data: FormData,
    _errorFields: string[],
  ): Promise<string[]> {
    const fixedFields: string[] = [];
    const scope = form as Element;

    // 1. 空の必須テキストフィールドを再入力
    const emptyRequiredInputs = scope.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
    >(
      "input[required]:not([type='checkbox']):not([type='radio']):not([type='hidden']), textarea[required], input[aria-required='true']:not([type='checkbox']):not([type='radio']):not([type='hidden']), textarea[aria-required='true']",
    );

    for (const field of emptyRequiredInputs) {
      if (field.value && field.value.trim() !== "") continue;

      const name = (field.name || field.id || "").toLowerCase();
      let valueToFill = "";

      // フィールド名からデータを推測
      if (
        name.includes("company") ||
        name.includes("kaisha") ||
        name.includes("corp")
      ) {
        valueToFill = data.company || "";
      } else if (name.includes("email") || name.includes("mail")) {
        valueToFill = data.email || "";
      } else if (
        name.includes("kana") ||
        name.includes("furigana") ||
        name.includes("yomi") ||
        name.includes("hurigana")
      ) {
        // カナ/ふりがなフィールド（sei/mei より先に判定する必要がある）
        if (
          name.includes("sei") ||
          name.includes("last") ||
          name.includes("family")
        ) {
          valueToFill = data.lastNameKana || "";
        } else if (
          name.includes("mei") ||
          name.includes("first") ||
          name.includes("given")
        ) {
          valueToFill = data.firstNameKana || "";
        } else {
          valueToFill =
            data.fullNameKana ||
            `${data.lastNameKana || ""} ${data.firstNameKana || ""}`.trim();
        }
      } else if (
        name.includes("name") ||
        name.includes("shimei") ||
        name.includes("onamae")
      ) {
        valueToFill =
          data.name || `${data.lastName || ""} ${data.firstName || ""}`.trim();
      } else if (
        name.includes("tel") ||
        name.includes("phone") ||
        name.includes("denwa")
      ) {
        valueToFill = data.phone || "";
      } else if (name.includes("sei")) {
        valueToFill = data.lastName || "";
      } else if (name.includes("mei") && !name.includes("mail")) {
        valueToFill = data.firstName || "";
      } else if (
        name.includes("depart") ||
        name.includes("busho") ||
        name.includes("section")
      ) {
        valueToFill = data.department || "";
      } else if (
        name.includes("message") ||
        name.includes("content") ||
        name.includes("inquiry") ||
        name.includes("naiyou")
      ) {
        valueToFill = data.message || "";
      } else if (name.includes("address") || name.includes("jusho")) {
        valueToFill = data.address || "";
      } else if (
        name.includes("zip") ||
        name.includes("postal") ||
        name.includes("yubin")
      ) {
        valueToFill = data.postalCode || "";
      } else if (
        name.includes("pref") ||
        name.includes("ken") ||
        name.includes("todofuken")
      ) {
        valueToFill = data.prefecture || "";
      }

      // ラベルテキストからも推測
      if (!valueToFill) {
        const labelEl = field.id
          ? document.querySelector<HTMLLabelElement>(
              `label[for="${CSS.escape(field.id)}"]`,
            )
          : null;
        const parentLabel = field.closest("label");
        const parentContainer = field.closest("div, p, td, th, dt, dd");
        const labelText = (
          labelEl?.textContent ||
          parentLabel?.textContent ||
          parentContainer?.textContent ||
          ""
        ).trim();

        if (/会社|企業|法人|組織/.test(labelText))
          valueToFill = data.company || "";
        else if (/メール|e-?mail/i.test(labelText))
          valueToFill = data.email || "";
        else if (/ふりがな|フリガナ|カナ|よみ|kana/i.test(labelText)) {
          // カナ系ラベルを名前より先に判定
          if (/せい|セイ|姓/i.test(labelText))
            valueToFill = data.lastNameKana || "";
          else if (/めい|メイ/i.test(labelText))
            valueToFill = data.firstNameKana || "";
          else
            valueToFill =
              data.fullNameKana ||
              `${data.lastNameKana || ""} ${data.firstNameKana || ""}`.trim();
        } else if (/お名前|氏名|担当者/.test(labelText))
          valueToFill =
            data.name ||
            `${data.lastName || ""} ${data.firstName || ""}`.trim();
        else if (/姓|苗字/.test(labelText)) valueToFill = data.lastName || "";
        else if (/^名$|^名\s/.test(labelText.trim()))
          valueToFill = data.firstName || "";
        else if (/電話|TEL|Phone/i.test(labelText))
          valueToFill = data.phone || "";
        else if (/部署|所属/.test(labelText))
          valueToFill = data.department || "";
        else if (/住所|所在地/.test(labelText))
          valueToFill = data.address || "";
        else if (/内容|メッセージ|message/i.test(labelText))
          valueToFill = data.message || "";
      }

      if (valueToFill) {
        await fillField(field, valueToFill);
        fixedFields.push(field.name || field.id || field.type);
        log(
          `Retry fill: ${field.name || field.id} = ${valueToFill.substring(0, 20)}...`,
        );
      }
    }

    // 2. 未選択の必須 select を選択
    const emptySelects = scope.querySelectorAll<HTMLSelectElement>(
      "select[required], select[aria-required='true']",
    );
    const nativeSelectSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;

    for (const select of emptySelects) {
      if (select.value && select.value !== "") continue;
      const options = select.querySelectorAll("option");
      for (const option of options) {
        const optText = option.textContent?.trim().toLowerCase() || "";
        const isPlaceholder =
          !option.value ||
          option.value === "" ||
          optText.includes("選択") ||
          optText.includes("select") ||
          optText === "-" ||
          optText === "--";
        if (!isPlaceholder && !option.disabled) {
          if (nativeSelectSetter) {
            nativeSelectSetter.call(select, option.value);
          } else {
            select.value = option.value;
          }
          select.dispatchEvent(new Event("change", { bubbles: true }));
          select.dispatchEvent(new Event("input", { bubbles: true }));
          fixedFields.push(select.name || select.id || "select");
          log(`Retry select: ${select.name || select.id} = ${option.value}`);
          await sleep(50);
          break;
        }
      }
    }

    // 3. 未チェックの必須チェックボックスをチェック
    const uncheckedRequired = scope.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][required]:not(:checked), input[type="checkbox"][aria-required="true"]:not(:checked)',
    );
    for (const cb of uncheckedRequired) {
      if (cb.disabled) {
        const enabled = await enableCheckboxByScrolling(cb);
        if (!enabled) continue;
      }
      cb.click();
      fixedFields.push(cb.name || cb.id || "checkbox");
      log(`Retry check: ${cb.name || cb.id}`);
      await sleep(50);
    }

    // 4. ラベルベースで同意系チェックボックスも再度チェック
    const agreeLabelKeywords = [
      "同意",
      "個人情報",
      "プライバシー",
      "利用規約",
      "取扱い",
      "取り扱い",
      "承諾",
      "了承",
    ];
    const allUnchecked = document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]:not(:checked)',
    );
    for (const cb of allUnchecked) {
      const labelEl = cb.id
        ? document.querySelector<HTMLLabelElement>(
            `label[for="${CSS.escape(cb.id)}"]`,
          )
        : null;
      const parentLabel = cb.closest("label");
      const parentContainer = cb.closest("div, p, span, li, td");
      const labelText = (
        labelEl?.textContent ||
        parentLabel?.textContent ||
        parentContainer?.textContent ||
        ""
      )
        .trim()
        .toLowerCase();

      if (agreeLabelKeywords.some((kw) => labelText.includes(kw))) {
        if (cb.disabled) {
          const enabled = await enableCheckboxByScrolling(cb);
          if (!enabled) continue;
        }
        cb.click();
        fixedFields.push(cb.name || cb.id || "agreement-checkbox");
        log(`Retry agreement check: "${labelText.substring(0, 40)}..."`);
        await sleep(50);
      }
    }

    // 5. 未選択のラジオボタングループを選択
    const radioGroups = new Set<string>();
    const radios = scope.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );
    for (const r of radios) {
      if (r.name) radioGroups.add(r.name);
    }
    const RETRY_PREFERRED = [
      "その他",
      "other",
      "一般",
      "お問い合わせ",
      "問い合わせ",
      "製品",
      "サービス",
      "general",
    ];
    const RETRY_AVOID = [
      "採用",
      "資料請求",
      "見積",
      "パートナー",
      "代理店",
      "recruit",
      "download",
    ];
    for (const groupName of radioGroups) {
      const escapedGroupName = CSS.escape(groupName);
      const groupRadios = scope.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${escapedGroupName}"]`,
      );
      const anyChecked = Array.from(groupRadios).some((r) => r.checked);
      if (!anyChecked && groupRadios.length > 0) {
        const radioArr = Array.from(groupRadios);
        const getLabel = (r: HTMLInputElement): string =>
          (
            r.closest("label")?.textContent?.trim() ||
            r.value ||
            ""
          ).toLowerCase();

        const preferred = radioArr.find((r) =>
          RETRY_PREFERRED.some((kw) => getLabel(r).includes(kw.toLowerCase())),
        );
        if (preferred) {
          preferred.click();
          fixedFields.push(groupName);
          log(`Retry preferred radio: ${groupName} = ${preferred.value}`);
        } else {
          const safe = radioArr.find(
            (r) =>
              !RETRY_AVOID.some((kw) => getLabel(r).includes(kw.toLowerCase())),
          );
          const target = safe || radioArr[0];
          target.click();
          fixedFields.push(groupName);
          log(`Retry radio: ${groupName} = ${target.value}`);
        }
        await sleep(100);
      }
    }

    // 6. required属性なしの空フィールドもラベルベースで埋める
    // JS検証のみで required を使わないフォーム向け
    const allEmptyInputs = scope.querySelectorAll<HTMLInputElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])',
    );
    for (const field of allEmptyInputs) {
      if (field.value && field.value.trim() !== "") continue;
      if (field.offsetParent === null) continue;

      const labelEl = field.id
        ? document.querySelector<HTMLLabelElement>(
            `label[for="${CSS.escape(field.id)}"]`,
          )
        : null;
      const parentLabel = field.closest("label");
      const parentContainer = field.closest("div, p, td, th, dt, dd, li");
      const labelText = (
        labelEl?.textContent ||
        parentLabel?.textContent ||
        parentContainer?.textContent ||
        ""
      )
        .trim()
        .substring(0, 200);
      const fieldName = (field.name || field.id || "").toLowerCase();

      let valueToFill = "";
      if (/電話|TEL|phone/i.test(labelText) && !/FAX/i.test(labelText)) {
        valueToFill = data.phone || "";
      } else if (fieldName.includes("tel") || fieldName.includes("phone")) {
        valueToFill = data.phone || "";
      } else if (
        /メール|e-?mail/i.test(labelText) &&
        !/確認|再入力/i.test(labelText)
      ) {
        valueToFill = data.email || "";
      } else if (/会社|企業|法人|company/i.test(labelText)) {
        valueToFill = data.company || "";
      } else if (
        /お名前|氏名|担当者|name/i.test(labelText) &&
        !/会社|法人|kana|カナ/i.test(labelText)
      ) {
        valueToFill =
          data.name || `${data.lastName || ""} ${data.firstName || ""}`.trim();
      }

      if (valueToFill) {
        await fillField(field, valueToFill);
        fixedFields.push(field.name || field.id || field.type);
        log(
          `Retry fill (label-based): "${labelText.substring(0, 30)}" → ${field.name || field.id} = ${valueToFill.substring(0, 20)}...`,
        );
      }
    }

    return fixedFields;
  }

  // カタカナをひらがなに変換
  function katakanaToHiragana(str: string): string {
    return str.replace(/[\u30A1-\u30F6]/g, (match) => {
      const chr = match.charCodeAt(0) - 0x60;
      return String.fromCharCode(chr);
    });
  }

  // ひらがなをカタカナに変換
  function hiraganaToKatakana(str: string): string {
    return str.replace(/[\u3041-\u3096]/g, (match) => {
      const chr = match.charCodeAt(0) + 0x60;
      return String.fromCharCode(chr);
    });
  }

  // フィールドに入力すべき文字種を判定（ひらがな/カタカナ）
  // ふりがなフィールドの場合のみ判定し、それ以外は変換しない
  function detectKanaType(
    field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  ): "hiragana" | "katakana" | "auto" {
    // textarea、selectは変換対象外
    if (
      field instanceof HTMLTextAreaElement ||
      field instanceof HTMLSelectElement
    ) {
      return "auto";
    }

    const fieldId = field.id;
    const fieldName = field.name;
    const nameLower = (fieldName || "").toLowerCase();

    // ============================================
    // Step 1: ふりがなフィールドかどうかを判定
    // ============================================
    let isKanaField = false;

    // 1-1. name属性で判定
    if (
      nameLower.includes("kana") ||
      nameLower.includes("furigana") ||
      nameLower.includes("yomi") ||
      nameLower.includes("hurigana")
    ) {
      isKanaField = true;
    }

    // ============================================
    // ふりがな判定用ヘルパー
    // ============================================

    // テキストからひらがなフィールドかを判定
    function isHiraganaText(text: string): boolean {
      return (
        text.includes("ふりがな") ||
        text.includes("よみ") ||
        /^せい[^かきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん]*$/.test(
          text,
        ) ||
        /^めい[^かきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん]*$/.test(
          text,
        ) ||
        text === "せい" ||
        text === "めい" ||
        text.startsWith("せい") ||
        text.startsWith("めい")
      );
    }

    // テキストからカタカナフィールドかを判定
    function isKatakanaText(text: string): boolean {
      return (
        text.includes("フリガナ") ||
        text.includes("ヨミ") ||
        text.includes("カナ") ||
        text === "セイ" ||
        text === "メイ" ||
        text.startsWith("セイ") ||
        text.startsWith("メイ")
      );
    }

    // テキストからふりがなフィールドかを判定（ひらがな・カタカナどちらでも）
    function isKanaText(text: string): boolean {
      return isHiraganaText(text) || isKatakanaText(text);
    }

    // 1-2. ラベル・placeholder で判定（name属性で判定できなかった場合のみ）
    if (!isKanaField) {
      // label[for]から取得
      if (fieldId) {
        const label = document.querySelector<HTMLLabelElement>(
          `label[for="${CSS.escape(fieldId)}"]`,
        );
        if (label) {
          const t = label.textContent?.trim() || "";
          if (isKanaText(t.toLowerCase()) || isKanaText(t)) isKanaField = true;
        }
      }

      // dt/ddパターンから取得
      if (!isKanaField) {
        const dtEl = field.closest("dd")?.previousElementSibling;
        if (dtEl && dtEl.tagName === "DT") {
          const t = dtEl.textContent?.trim() || "";
          if (isKanaText(t.toLowerCase()) || isKanaText(t)) isKanaField = true;
        }
      }

      // th/tdパターンから取得
      if (!isKanaField) {
        const tdEl = field.closest("td");
        if (tdEl) {
          const thEl = tdEl.previousElementSibling;
          if (thEl && (thEl.tagName === "TH" || thEl.tagName === "TD")) {
            const t = thEl.textContent?.trim() || "";
            if (isKanaText(t.toLowerCase()) || isKanaText(t))
              isKanaField = true;
          }
        }
      }

      // placeholderから取得（label がない場合に有効）
      if (!isKanaField) {
        const placeholder = field.placeholder || "";
        if (isKanaText(placeholder.toLowerCase()) || isKanaText(placeholder)) {
          isKanaField = true;
        }
      }
    }

    // ふりがなフィールドでない場合は変換しない
    if (!isKanaField) {
      return "auto";
    }

    // ============================================
    // Step 2: ひらがな or カタカナを判定
    // 優先順位: label[for] > dt/dd > th/td > placeholder > デフォルト
    // ============================================

    // 判定用テキストを収集（優先度順）
    const candidateTexts: string[] = [];

    if (fieldId) {
      const label = document.querySelector<HTMLLabelElement>(
        `label[for="${CSS.escape(fieldId)}"]`,
      );
      if (label?.textContent) candidateTexts.push(label.textContent.trim());
    }

    const dtEl2 = field.closest("dd")?.previousElementSibling;
    if (dtEl2?.tagName === "DT" && dtEl2.textContent)
      candidateTexts.push(dtEl2.textContent.trim());

    const tdEl2 = field.closest("td");
    if (tdEl2) {
      const thEl2 = tdEl2.previousElementSibling;
      if (
        thEl2 &&
        (thEl2.tagName === "TH" || thEl2.tagName === "TD") &&
        thEl2.textContent
      )
        candidateTexts.push(thEl2.textContent.trim());
    }

    if (field instanceof HTMLInputElement && field.placeholder)
      candidateTexts.push(field.placeholder);

    // 最初にヒットしたテキストで判定
    for (const text of candidateTexts) {
      if (isHiraganaText(text.toLowerCase()) || isHiraganaText(text)) {
        return "hiragana";
      }
      if (isKatakanaText(text)) {
        return "katakana";
      }
    }

    // デフォルト（name属性にkanaが含まれる場合はカタカナ）
    if (
      nameLower.includes("kana") ||
      nameLower.includes("furigana") ||
      nameLower.includes("yomi")
    ) {
      return "katakana";
    }

    // 判定できない場合は変換しない
    return "auto";
  }

  // フィールドに値を入力
  async function fillField(
    field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    value: string,
  ): Promise<void> {
    // フォーカス
    field.focus();
    await sleep(50);

    if (field instanceof HTMLSelectElement) {
      // セレクトボックス（React対応: nativeSelectValueSetterを使用）
      const nativeSelectValSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value",
      )?.set;

      const options = field.querySelectorAll("option");
      let matched = false;
      for (const option of options) {
        if (option.value === value || option.textContent?.trim() === value) {
          if (nativeSelectValSetter) {
            nativeSelectValSetter.call(field, option.value);
          } else {
            field.value = option.value;
          }
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
          matched = true;
          break;
        }
      }

      // 完全一致しない場合、部分一致で探す
      if (!matched) {
        for (const option of options) {
          const optText = option.textContent?.trim() || "";
          const optVal = option.value || "";
          if (
            (optText && optText.includes(value)) ||
            (optVal && optVal.includes(value)) ||
            (value && optText.toLowerCase().includes(value.toLowerCase()))
          ) {
            if (nativeSelectValSetter) {
              nativeSelectValSetter.call(field, option.value);
            } else {
              field.value = option.value;
            }
            field.dispatchEvent(new Event("input", { bubbles: true }));
            field.dispatchEvent(new Event("change", { bubbles: true }));
            log(`Select partial match: "${value}" → "${optText}"`);
            break;
          }
        }
      }
    } else {
      // ふりがなフィールドの場合のみ、文字種の変換を行う
      // それ以外のフィールド（名前、会社名、お問い合わせ内容など）は変換しない
      let finalValue = value;
      const kanaType = detectKanaType(field);

      if (kanaType === "katakana") {
        // カタカナが必要な場合、ひらがな → カタカナ に変換
        finalValue = hiraganaToKatakana(value);
      } else if (kanaType === "hiragana") {
        // ひらがなが必要な場合、念のためカタカナ → ひらがな に変換（混在対策）
        finalValue = katakanaToHiragana(value);
      }
      // kanaType === 'auto' の場合は変換せず、そのまま入力

      // Unicode正規化（濁点・半濁点の結合文字対応）
      finalValue = finalValue.normalize("NFC");

      // 既存の値をクリア
      field.value = "";

      // React等のフレームワーク対応: nativeInputValueSetterを使用
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;

      // IME入力シミュレーション（日本語入力フレームワーク対応）
      // compositionstart → 値設定 → input → compositionend → change の順
      field.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
      await sleep(10);

      if (field instanceof HTMLTextAreaElement && nativeTextAreaValueSetter) {
        nativeTextAreaValueSetter.call(field, finalValue);
      } else if (field instanceof HTMLInputElement && nativeInputValueSetter) {
        nativeInputValueSetter.call(field, finalValue);
      } else {
        field.value = finalValue;
      }

      // イベント発火（正しい順序で段階的に発火）
      // 0. keydown / keypress（jQuery Validation等の互換性向上）
      const lastChar = finalValue.slice(-1);
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: lastChar, bubbles: true }),
      );
      field.dispatchEvent(
        new KeyboardEvent("keypress", { key: lastChar, bubbles: true }),
      );

      // 1. input イベント
      field.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(10);

      // 2. InputEvent（React等の合成イベント対応）
      const inputEvent = new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: finalValue,
      });
      field.dispatchEvent(inputEvent);
      await sleep(10);

      // 3. keyup
      field.dispatchEvent(
        new KeyboardEvent("keyup", { key: lastChar, bubbles: true }),
      );

      // 4. compositionend イベント（IME入力完了）
      field.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          data: finalValue,
        }),
      );
      await sleep(10);

      // 5. change イベント
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // ブラー
    field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    field.blur();
    field.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

    // 少し待機（フレームワークのState更新を待つ）
    await sleep(150);
  }

  /**
   * AJAX送信（CF7等）のエラーレスポンスを検知する
   */
  function detectAjaxFormError(form: HTMLFormElement | Element): {
    hasError: boolean;
    errorMessage: string | null;
    isSpam: boolean;
  } {
    const scope = form.closest(".wpcf7") || form;

    // CF7のレスポンス出力をチェック
    const responseOutput = scope.querySelector(".wpcf7-response-output");
    if (responseOutput) {
      const text = responseOutput.textContent?.trim() || "";
      const isHidden = responseOutput.getAttribute("aria-hidden") === "true";
      if (text && !isHidden) {
        const isError =
          text.includes("失敗") ||
          text.includes("error") ||
          text.includes("エラー");
        const isSpam =
          (form as HTMLFormElement).getAttribute?.("data-status") === "spam" ||
          text.includes("スパム");
        if (isError || isSpam) {
          return { hasError: true, errorMessage: text, isSpam };
        }
      }
    }

    // CF7のdata-statusチェック
    const formEl = form as HTMLFormElement;
    const status =
      formEl.getAttribute?.("data-status") ||
      formEl.closest?.("[data-status]")?.getAttribute("data-status");
    if (
      status === "spam" ||
      status === "mail_failed" ||
      status === "validation_failed"
    ) {
      return {
        hasError: true,
        errorMessage: `CF7 status: ${status}`,
        isSpam: status === "spam",
      };
    }

    // screen-reader-responseのチェック
    const srResponse = scope.querySelector(
      '.screen-reader-response [role="status"]',
    );
    if (srResponse) {
      const text = srResponse.textContent?.trim() || "";
      if (text && (text.includes("失敗") || text.includes("error"))) {
        return { hasError: true, errorMessage: text, isSpam: false };
      }
    }

    return { hasError: false, errorMessage: null, isSpam: false };
  }

  // 送信前のページテキストスナップショット（checkSuccessText の誤検知防止用）
  let preSubmitBodyText: string | null = null;

  // 送信ボタンを探して押す
  async function submitForm(
    form: HTMLFormElement | Element,
  ): Promise<{ success: boolean; confirmed?: boolean; error?: string }> {
    // 送信前のページテキストをスナップショットとして保存
    preSubmitBodyText = document.body.textContent || "";

    // reCAPTCHA v2（チェックボックス型）がフォーム内にあれば早期終了
    const captchaInForm =
      form.querySelector(
        '[class*="g-recaptcha"], [data-sitekey], .g-recaptcha, #g-recaptcha',
      ) ||
      document.querySelector(
        '[class*="g-recaptcha"], [data-sitekey], .g-recaptcha, #g-recaptcha',
      );
    if (captchaInForm) {
      log(`⛔ reCAPTCHA detected in form before submit - skipping`);
      return {
        success: false,
        error: "reCAPTCHA（フォーム内）検出のため送信不可",
      };
    }

    // window.alert / window.confirm をオーバーライド（ダイアログによるブロッキング防止）
    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    let alertCalled = false;
    let alertMessage = "";
    window.alert = (msg?: string) => {
      alertCalled = true;
      alertMessage = msg || "";
      log(`[Intercepted] window.alert: "${msg || ""}"`);
    };
    window.confirm = (msg?: string): boolean => {
      log(`[Intercepted] window.confirm: "${msg || ""}"`);
      return true;
    };

    try {
      // 除外キーワード
      const excludeKeywords = [
        "検索",
        "search",
        "ログイン",
        "login",
        "登録",
        "register",
        "キャンセル",
        "cancel",
        "リセット",
        "reset",
        "クリア",
        "clear",
        "戻る",
        "back",
      ];

      // まず、フォーム内のすべてのボタンを取得して確認ボタンを探す
      // 「確認」が含まれるボタンを優先的に探す
      log(`Searching for buttons in form...`);
      const allButtons = form.querySelectorAll<HTMLElement>(
        'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], a.btn, a.button, a[class*="submit"], a[class*="btn-primary"]',
      );

      // 確認ボタンを探す（「確認」を含むテキスト）
      let confirmButton: HTMLElement | null = null;
      for (const btn of allButtons) {
        if (!isButtonVisible(btn)) continue;

        const text = getButtonText(btn);
        const textLower = text.toLowerCase();

        // 除外キーワードチェック
        if (
          excludeKeywords.some((kw: string) =>
            textLower.includes(kw.toLowerCase()),
          )
        ) {
          continue;
        }

        // 「確認」が含まれていれば確認ボタン
        if (
          text.includes("確認") ||
          textLower.includes("confirm") ||
          textLower.includes("check")
        ) {
          confirmButton = btn;
          log(`Found confirm button by text: "${text}"`);
          break;
        }
      }

      // 確認ボタンが見つかった場合
      if (confirmButton) {
        log(`Clicking confirm button: ${getButtonInfo(confirmButton)}`);
        const clickedConfirmButton = confirmButton;
        confirmButton.click();

        // alertがキャッチされた場合
        if (alertCalled) {
          log(`❌ Alert intercepted on confirm: "${alertMessage}"`);
          return {
            success: false,
            error: `ページスクリプトにより送信がブロックされました: ${alertMessage}`,
          };
        }

        // 短い待機後、成功ページをチェック
        await sleep(500);

        // URL変更による成功判定
        const urlAfter = window.location.href;
        if (checkSuccessUrl(urlAfter)) {
          log(`✅ Success page detected by URL: ${urlAfter}`);
          return { success: true, confirmed: true };
        }

        // ページ内テキストによる成功判定
        if (checkSuccessText()) {
          log(`✅ Success detected by page text`);
          return { success: true, confirmed: true };
        }

        // MutationObserverを使って新しい送信ボタンの出現を待機
        log(
          `Confirmation page detected, searching for final submit button (using MutationObserver)...`,
        );

        const submitKeywords = ["送信", "submit", "send", "完了", "ok"];
        const finalSubmitBtn = await waitForNewButton(
          [...excludeKeywords, "確認", "confirm", "check"], // 確認ボタンも除外
          submitKeywords,
          5000, // 最大5秒待機
        );

        if (finalSubmitBtn && finalSubmitBtn !== clickedConfirmButton) {
          const text = getButtonText(finalSubmitBtn);
          log(`Found final submit button: "${text}"`);
          finalSubmitBtn.click();
          log(`Waiting for submission completion (2s)...`);
          await sleep(2000);

          // 送信後の成功判定
          const finalUrl = window.location.href;
          if (checkSuccessUrl(finalUrl)) {
            log(`✅ Success page detected by URL: ${finalUrl}`);
            return { success: true, confirmed: true };
          }

          if (checkSuccessText()) {
            log(`✅ Success detected by page text`);
            return { success: true, confirmed: true };
          }

          // 成功判定できない場合でも、ボタンをクリックできたら成功とみなす
          log(`✅ Submit button clicked successfully`);
          return { success: true, confirmed: true };
        }

        // フォールバック: MutationObserverで見つからない場合、手動でページを再スキャン
        log(`MutationObserver timeout, falling back to manual search...`);
        await sleep(1000);

        const allPageButtons = document.querySelectorAll<HTMLElement>(
          'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], a.btn, a.button, a[class*="submit"], a[class*="btn-primary"]',
        );

        for (const btn of allPageButtons) {
          if (!isButtonVisible(btn)) continue;
          if (btn === clickedConfirmButton) continue;

          const text = getButtonText(btn);
          const textLower = text.toLowerCase();

          if (
            excludeKeywords.some((kw: string) =>
              textLower.includes(kw.toLowerCase()),
            )
          ) {
            continue;
          }

          if (
            text.includes("確認") ||
            textLower.includes("confirm") ||
            textLower.includes("check")
          ) {
            continue;
          }

          if (
            text.includes("送信") ||
            textLower.includes("submit") ||
            textLower.includes("send")
          ) {
            log(`Found final submit button (fallback): "${text}"`);
            btn.click();
            await sleep(2000);

            if (checkSuccessUrl(window.location.href) || checkSuccessText()) {
              log(`✅ Success detected`);
              return { success: true, confirmed: true };
            }

            log(`✅ Submit button clicked`);
            return { success: true, confirmed: true };
          }
        }

        // type="submit"のボタンをフォールバックで探す
        for (const btn of allPageButtons) {
          if (!isButtonVisible(btn)) continue;
          if (btn === clickedConfirmButton) continue;

          const text = getButtonText(btn);
          const textLower = text.toLowerCase();

          if (
            excludeKeywords.some((kw: string) =>
              textLower.includes(kw.toLowerCase()),
            )
          ) {
            continue;
          }
          if (text.includes("確認")) continue;

          const inputBtn = btn as HTMLInputElement;
          if (inputBtn.type === "submit" || btn.tagName === "BUTTON") {
            log(`Found generic submit button (fallback): "${text}"`);
            btn.click();
            await sleep(2000);

            if (checkSuccessUrl(window.location.href) || checkSuccessText()) {
              log(`✅ Success detected`);
              return { success: true, confirmed: true };
            }

            log(`✅ Submit button clicked`);
            return { success: true, confirmed: true };
          }
        }

        log(`❌ Final submit button not found after confirm`);
        return {
          success: false,
          error:
            "確認ボタンを押下しましたが、最終送信ボタンが見つかりませんでした",
        };
      }

      // 確認ボタンがない場合、送信ボタンを探す
      log(`No confirm button found, searching for submit button...`);
      let submitButton: HTMLElement | null = null;

      // 送信ボタンを探す（「送信」を含み、「確認」を含まないテキスト）
      for (const btn of allButtons) {
        if (!isButtonVisible(btn)) continue;

        const text = getButtonText(btn);
        const textLower = text.toLowerCase();

        // 除外キーワードチェック
        if (
          excludeKeywords.some((kw: string) =>
            textLower.includes(kw.toLowerCase()),
          )
        ) {
          continue;
        }

        // 「確認」が含まれている場合はスキップ（確認ボタンとして既に処理済み）
        if (
          text.includes("確認") ||
          textLower.includes("confirm") ||
          textLower.includes("check")
        ) {
          continue;
        }

        // 送信系キーワードにマッチすれば送信ボタン
        if (
          text.includes("送信") ||
          text.includes("送る") ||
          text.includes("お問い合わせ") ||
          text.includes("問い合わせる") ||
          text.includes("申し込") ||
          text.includes("申込") ||
          text.includes("確定") ||
          textLower.includes("submit") ||
          textLower.includes("send") ||
          textLower.includes("apply") ||
          textLower.includes("go")
        ) {
          submitButton = btn;
          log(`Found submit button by text: "${text}"`);
          break;
        }
      }

      // 見つからない場合、type="submit" のボタンを探す
      if (!submitButton) {
        for (const btn of allButtons) {
          if (!isButtonVisible(btn)) continue;

          const text = getButtonText(btn);
          const textLower = text.toLowerCase();

          // 除外キーワードと確認キーワードをチェック
          if (
            excludeKeywords.some((kw: string) =>
              textLower.includes(kw.toLowerCase()),
            )
          ) {
            continue;
          }
          if (
            text.includes("確認") ||
            textLower.includes("confirm") ||
            textLower.includes("check")
          ) {
            continue;
          }

          // type="submit" または type="button" で、除外されていないボタン
          const inputBtn = btn as HTMLInputElement;
          if (inputBtn.type === "submit" || btn.tagName === "BUTTON") {
            submitButton = btn;
            log(`Found generic submit button: "${text}"`);
            break;
          }
        }
      }

      if (submitButton) {
        // disabled ボタンの検出と対処
        const isDisabled =
          (submitButton as HTMLInputElement).disabled ||
          submitButton.getAttribute("disabled") !== null;

        if (isDisabled) {
          log(`Submit button is disabled: ${getButtonInfo(submitButton)}`);

          // CAPTCHA が原因で disabled になっている場合を検出
          const captcha = detectCaptcha(form as Element);
          if (captcha.hasCaptcha && captcha.isBlocker) {
            log(
              `❌ CAPTCHA detected (${captcha.captchaType}): auto-submit not possible`,
            );
            return {
              success: false,
              error: `${captcha.captchaType}が検出されました。自動送信はできません`,
            };
          }

          // CAPTCHA以外の理由で disabled の場合、enable を試みる
          log(`Attempting to enable disabled button...`);
          (submitButton as HTMLInputElement).disabled = false;
          submitButton.removeAttribute("disabled");
          await sleep(200);
        }

        log(`Clicking submit button: ${getButtonInfo(submitButton)}`);
        submitButton.click();

        // alertがキャッチされた場合（チェックボックス未チェック等）
        if (alertCalled) {
          log(
            `❌ Alert intercepted: "${alertMessage}" — submission was prevented by page script`,
          );
          return {
            success: false,
            error: `ページスクリプトにより送信がブロックされました: ${alertMessage}`,
          };
        }

        log(`Waiting for submission completion (polling up to 10s)...`);
        const urlBefore = window.location.href;
        let successDetected = false;
        for (let pollI = 0; pollI < 20; pollI++) {
          await sleep(500);
          const currentUrl = window.location.href;
          if (checkSuccessUrl(currentUrl)) {
            log(`✅ Success page detected by URL: ${currentUrl}`);
            return { success: true, confirmed: true };
          }
          if (checkSuccessText()) {
            log(`✅ Success detected by page text`);
            return { success: true, confirmed: true };
          }
          if (checkFormPluginComplete()) {
            log(`✅ Form plugin completion detected during polling`);
            return { success: true, confirmed: true };
          }
          if (currentUrl !== urlBefore) {
            successDetected = true;
            break;
          }
          // AJAX送信エラーを早期検知
          const earlyAjaxError = detectAjaxFormError(form);
          if (earlyAjaxError.hasError) break;
        }

        if (successDetected) {
          const finalUrl = window.location.href;
          if (checkSuccessUrl(finalUrl) || checkSuccessText()) {
            log(`✅ Success after URL change: ${finalUrl}`);
            return { success: true, confirmed: true };
          }
        }

        // CF7等のAJAX送信エラーを検知
        const ajaxError = detectAjaxFormError(form);
        if (ajaxError.hasError) {
          if (ajaxError.isSpam) {
            const captcha = detectCaptcha(form as Element);
            log(`❌ AJAX form error (spam): ${ajaxError.errorMessage}`);
            return {
              success: false,
              error: `reCAPTCHA v3によりスパム判定されました${captcha.hasCaptcha ? `（${captcha.captchaType}）` : ""}。自動送信はできません`,
            };
          }
          log(`❌ AJAX form error: ${ajaxError.errorMessage}`);
          return {
            success: false,
            error: `フォーム送信エラー: ${ajaxError.errorMessage}`,
          };
        }

        // ボタンが disabled だった場合で成功判定できなければ失敗扱い
        if (isDisabled) {
          const captcha = detectCaptcha(form as Element);
          if (captcha.hasCaptcha) {
            return {
              success: false,
              error: `送信ボタンがdisabled（${captcha.captchaType}の可能性）。自動送信できませんでした`,
            };
          }
          return {
            success: false,
            error:
              "送信ボタンがdisabledのため送信に失敗しました（入力バリデーションエラーの可能性）",
          };
        }

        // フォームプラグイン完了チェック
        if (checkFormPluginComplete()) {
          log(`✅ Form plugin completion detected after submit`);
          return { success: true, confirmed: true };
        }

        log(
          `⚠️ Submit button clicked but success not confirmed (no URL change or success text)`,
        );
        return { success: true, confirmed: false };
      }

      // フォーム内に見つからない場合、ドキュメント全体からも探す
      log(`No button found in form, searching in entire document...`);
      const allDocButtons = document.querySelectorAll<HTMLElement>(
        'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], a.btn, a.button, a[class*="submit"], a[class*="btn-primary"]',
      );

      // まず確認ボタンを探す
      for (const btn of allDocButtons) {
        if (!isButtonVisible(btn)) continue;

        const text = getButtonText(btn);
        const textLower = text.toLowerCase();

        if (
          excludeKeywords.some((kw: string) =>
            textLower.includes(kw.toLowerCase()),
          )
        ) {
          continue;
        }

        if (
          text.includes("確認") ||
          textLower.includes("confirm") ||
          textLower.includes("check")
        ) {
          log(`Found confirm button in document: "${text}"`);
          const clickedButton = btn;
          btn.click();

          // 短い待機後、成功ページをチェック
          await sleep(500);

          if (checkSuccessUrl(window.location.href) || checkSuccessText()) {
            log(`✅ Success after confirm button click`);
            return { success: true, confirmed: true };
          }

          // MutationObserverを使って新しい送信ボタンの出現を待機
          log(
            `Searching for final submit button after confirm (using MutationObserver)...`,
          );
          const submitKeywords = ["送信", "submit", "send", "完了", "ok"];
          const finalSubmitBtn = await waitForNewButton(
            [...excludeKeywords, "確認", "confirm", "check"], // 確認ボタンも除外
            submitKeywords,
            5000, // 最大5秒待機
          );

          if (finalSubmitBtn && finalSubmitBtn !== clickedButton) {
            const submitText = getButtonText(finalSubmitBtn);
            log(`Found final submit button: "${submitText}"`);
            finalSubmitBtn.click();
            await sleep(2000);

            if (checkSuccessUrl(window.location.href) || checkSuccessText()) {
              log(`✅ Success after final submit`);
              return { success: true, confirmed: true };
            }

            log(`⚠️ Final submit button clicked but success not confirmed`);
            return { success: true, confirmed: false };
          }

          // フォールバック: 従来の方法でも探す
          log(`MutationObserver timeout, falling back to manual search...`);
          await sleep(1000);

          const allDocButtonsRefresh = document.querySelectorAll<HTMLElement>(
            'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], a.btn, a.button, a[class*="submit"], a[class*="btn-primary"]',
          );
          for (const submitBtn of allDocButtonsRefresh) {
            if (!isButtonVisible(submitBtn)) continue;
            if (submitBtn === clickedButton) continue;

            const submitText = getButtonText(submitBtn);
            const submitTextLower = submitText.toLowerCase();

            if (
              excludeKeywords.some((kw: string) =>
                submitTextLower.includes(kw.toLowerCase()),
              )
            ) {
              continue;
            }

            if (submitText.includes("確認")) continue;

            if (
              submitText.includes("送信") ||
              submitText.includes("送る") ||
              submitText.includes("お問い合わせ") ||
              submitText.includes("問い合わせる") ||
              submitText.includes("申し込") ||
              submitText.includes("申込") ||
              submitText.includes("確定") ||
              submitTextLower.includes("submit") ||
              submitTextLower.includes("send") ||
              submitTextLower.includes("apply") ||
              submitTextLower.includes("go")
            ) {
              log(`Found final submit button (fallback): "${submitText}"`);
              submitBtn.click();
              await sleep(2000);

              if (checkSuccessUrl(window.location.href) || checkSuccessText()) {
                log(`✅ Success after final submit`);
                return { success: true, confirmed: true };
              }

              log(
                `⚠️ Final submit button clicked (fallback) but success not confirmed`,
              );
              return { success: true, confirmed: false };
            }
          }

          log(`❌ Final submit button not found after confirm`);
          return {
            success: false,
            error:
              "確認ボタンを押下しましたが、最終送信ボタンが見つかりませんでした",
          };
        }
      }

      // 送信ボタンを探す
      for (const btn of allDocButtons) {
        if (!isButtonVisible(btn)) continue;

        const text = getButtonText(btn);
        const textLower = text.toLowerCase();

        if (
          excludeKeywords.some((kw: string) =>
            textLower.includes(kw.toLowerCase()),
          )
        ) {
          continue;
        }

        if (text.includes("確認")) continue; // 確認ボタンはスキップ済み

        if (
          text.includes("送信") ||
          text.includes("送る") ||
          text.includes("お問い合わせ") ||
          text.includes("問い合わせる") ||
          text.includes("申し込") ||
          text.includes("申込") ||
          text.includes("確定") ||
          textLower.includes("submit") ||
          textLower.includes("send") ||
          textLower.includes("apply") ||
          textLower.includes("go")
        ) {
          log(`Found submit button in document: "${text}"`);
          btn.click();
          await sleep(2000);

          if (checkSuccessUrl(window.location.href) || checkSuccessText()) {
            log(`✅ Success after submit`);
            return { success: true, confirmed: true };
          }

          log(
            `⚠️ Submit button clicked (document-wide) but success not confirmed`,
          );
          return { success: true, confirmed: false };
        }
      }

      // フォールバック: ボタンが見つからない場合、form.submit() を直接試行
      if (form.tagName?.toLowerCase() === "form") {
        log(`No button found, attempting form.submit() as fallback...`);
        try {
          const fbUrlBefore = window.location.href;
          (form as HTMLFormElement).submit();

          for (let fbI = 0; fbI < 20; fbI++) {
            await sleep(500);
            if (checkSuccessUrl(window.location.href) || checkSuccessText()) {
              log(`✅ Success after form.submit() fallback`);
              return { success: true, confirmed: true };
            }
            if (checkFormPluginComplete()) {
              log(
                `✅ Form plugin completion detected after form.submit() fallback`,
              );
              return { success: true, confirmed: true };
            }
            if (window.location.href !== fbUrlBefore) break;
          }

          log(`⚠️ form.submit() executed but success not confirmed`);
          return { success: true, confirmed: false };
        } catch (submitError) {
          log(`❌ form.submit() fallback failed: ${submitError}`);
        }
      }

      log(
        `❌ No submit/confirm button found and no form.submit() fallback available`,
      );
      return {
        success: false,
        error: "送信ボタンまたは確認ボタンが見つかりません",
      };
    } finally {
      // window.alert / window.confirm を必ず復元
      window.alert = originalAlert;
      window.confirm = originalConfirm;
    }
  }

  // ボタンのテキストを取得
  function getButtonText(button: HTMLElement | null | undefined): string {
    if (!button) return "";
    if (button instanceof HTMLInputElement) {
      return (
        button.value || button.getAttribute("aria-label") || button.title || ""
      );
    }
    return (
      button.textContent?.trim() ||
      button.getAttribute("aria-label") ||
      button.title ||
      ""
    );
  }

  // ボタンが表示されているか確認
  function isButtonVisible(button: HTMLElement): boolean {
    // offsetParentがnullの場合、要素は表示されていない
    if (button.offsetParent === null && button.style.display !== "contents") {
      return false;
    }

    // display: noneチェック
    const style = window.getComputedStyle(button);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    return true;
  }

  // CAPTCHA検出（reCAPTCHA v2/v3, hCaptcha, Turnstile等）
  function detectCaptcha(scope?: Element): {
    hasCaptcha: boolean;
    captchaType: string | null;
    isBlocker: boolean; // trueの場合、自動送信不可
  } {
    const root = scope || document;

    // reCAPTCHA v2 (チェックボックス型) — cross-origin iframe、自動突破不可
    const recaptchaV2 =
      root.querySelector(".g-recaptcha") ||
      root.querySelector('iframe[src*="recaptcha/api2/anchor"]') ||
      root.querySelector("[data-sitekey]");
    if (recaptchaV2) {
      // v2 checkbox vs invisible の判定
      const sizeAttr = recaptchaV2.getAttribute("data-size");
      if (sizeAttr === "invisible") {
        return {
          hasCaptcha: true,
          captchaType: "reCAPTCHA v2 (invisible)",
          isBlocker: false, // invisible は送信時に自動評価
        };
      }
      return {
        hasCaptcha: true,
        captchaType: "reCAPTCHA v2 (checkbox)",
        isBlocker: true,
      };
    }

    // reCAPTCHA v3 (invisible/score-based) — 送信時に自動評価、ブロッカーではない
    const recaptchaV3 =
      root.querySelector('input[name="g-recaptcha-response"]') ||
      root.querySelector(".grecaptcha-badge") ||
      root.querySelector('script[src*="recaptcha/api.js?render="]');
    if (recaptchaV3) {
      return {
        hasCaptcha: true,
        captchaType: "reCAPTCHA v3",
        isBlocker: false,
      };
    }

    // hCaptcha
    const hcaptcha =
      root.querySelector(".h-captcha") ||
      root.querySelector('iframe[src*="hcaptcha.com"]');
    if (hcaptcha) {
      return {
        hasCaptcha: true,
        captchaType: "hCaptcha",
        isBlocker: true,
      };
    }

    // Cloudflare Turnstile
    const turnstile =
      root.querySelector(".cf-turnstile") ||
      root.querySelector('iframe[src*="challenges.cloudflare.com"]');
    if (turnstile) {
      return {
        hasCaptcha: true,
        captchaType: "Cloudflare Turnstile",
        isBlocker: true,
      };
    }

    return { hasCaptcha: false, captchaType: null, isBlocker: false };
  }

  // スクロールしてチェックボックスを有効化
  async function enableCheckboxByScrolling(
    checkbox: HTMLInputElement,
  ): Promise<boolean> {
    log(`Attempting to enable checkbox by scrolling...`);

    // スクロール可能な親要素を探す
    let scrollableElement: HTMLElement | null = null;
    let currentElement = checkbox.parentElement;

    while (currentElement && currentElement !== document.body) {
      const style = window.getComputedStyle(currentElement);
      const hasScroll =
        style.overflowY === "scroll" ||
        style.overflowY === "auto" ||
        style.overflow === "scroll" ||
        style.overflow === "auto";

      // スクロール可能で、実際にスクロールできる高さがある場合
      if (
        hasScroll &&
        currentElement.scrollHeight > currentElement.clientHeight
      ) {
        scrollableElement = currentElement;
        log(
          `Found scrollable element: ${currentElement.tagName}.${currentElement.className}`,
        );
        break;
      }

      currentElement = currentElement.parentElement;
    }

    // スクロール可能な要素が見つからない場合、チェックボックスの近くにあるtextareaやdivを探す
    if (!scrollableElement) {
      // チェックボックスの前にある scrollable な要素を探す
      const possibleScrollables = checkbox
        .closest("form, .form, .modal, .dialog, .container")
        ?.querySelectorAll(
          'div[style*="overflow"], div[style*="scroll"], textarea',
        );

      if (possibleScrollables) {
        for (const el of possibleScrollables) {
          const element = el as HTMLElement;
          const style = window.getComputedStyle(element);
          const hasScroll =
            style.overflowY === "scroll" ||
            style.overflowY === "auto" ||
            style.overflow === "scroll" ||
            style.overflow === "auto";

          if (hasScroll && element.scrollHeight > element.clientHeight) {
            scrollableElement = element;
            log(
              `Found scrollable element by search: ${element.tagName}.${element.className}`,
            );
            break;
          }
        }
      }
    }

    if (!scrollableElement) {
      log(`No scrollable element found`);
      return false;
    }

    // 最下部までスクロール
    log(`Scrolling to bottom of element...`);
    scrollableElement.scrollTop = scrollableElement.scrollHeight;

    // チェックボックスが有効化されるまで待機（最大3秒、100ms間隔でチェック）
    const maxAttempts = 30; // 3秒 = 30 * 100ms
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(100);

      if (!checkbox.disabled) {
        log(`Checkbox enabled after ${i * 100}ms`);
        return true;
      }

      // 追加でスクロールを試みる（JavaScriptでの制御がある場合に備えて）
      if (i % 5 === 0) {
        // 500msごとに再スクロール
        scrollableElement.scrollTop = scrollableElement.scrollHeight;
      }
    }

    log(`Checkbox still disabled after ${maxAttempts * 100}ms`);
    return false;
  }

  // URL変更による成功判定
  function checkSuccessUrl(url: string): boolean {
    const successUrlPatterns = [
      // 英語
      "thanks",
      "thank-you",
      "thankyou",
      "thank_you",
      "thank",
      "success",
      "successful",
      "complete",
      "completed",
      "completion",
      "done",
      "finish",
      "finished",
      "sent",
      "submitted",
      "submission",
      "received",
      "confirmed",
      // クエリパラメータパターン
      "status=ok",
      "status=success",
      "status=complete",
      "result=ok",
      "result=success",
      "mode=complete",
      "mode=thanks",
      "mode=finish",
      // ローマ字
      "kanryo",
      "hozon",
      "toroku",
      "kakunin",
      "uketsuke",
      "arigatou",
      // 日本語（URLエンコードされる場合もあるため）
      "完了",
      "ありがとう",
      "送信完了",
      "受付完了",
    ];
    const urlLower = url.toLowerCase();
    // デコードされたURLもチェック
    let decodedUrl = urlLower;
    try {
      decodedUrl = decodeURIComponent(urlLower);
    } catch {
      // デコード失敗時は元のURLを使用
    }
    return successUrlPatterns.some(
      (pattern) => urlLower.includes(pattern) || decodedUrl.includes(pattern),
    );
  }

  // ページ内テキストによる成功判定（送信前スナップショットとの差分で判定）
  function checkSuccessText(): boolean {
    const pageText = document.body.textContent || "";
    const pageTextLower = pageText.toLowerCase();

    // 送信前スナップショットがある場合、差分のみで判定（誤検知防止）
    const checkText = preSubmitBodyText
      ? pageTextLower.replace(preSubmitBodyText.toLowerCase(), "")
      : pageTextLower;

    // URL変更がある場合は全文で判定（ページ遷移後は新しいページなので差分不要）
    const useFullText =
      !preSubmitBodyText ||
      window.location.href !== (preSubmitBodyText ? document.referrer : "");

    const successKeywords = [
      // 日本語（一般的なお問い合わせ完了メッセージ）
      "ありがとうございました",
      "ありがとうございます",
      "お問い合わせを受け付けました",
      "お問い合わせいただきありがとう",
      "お問い合わせありがとう",
      "送信完了",
      "送信しました",
      "送信が完了しました",
      "送信が完了",
      "送信されました",
      "受け付けました",
      "受付完了",
      "完了しました",
      "完了いたしました",
      "お問い合わせいただき",
      "送信いただき",
      "お送りいただき",
      "承りました",
      "受信しました",
      "受領しました",
      // 追加パターン（日本語）
      "問い合わせを受け付け",
      "お問合せを受け付け",
      "メールをお送りしました",
      "確認メールを送信",
      "自動返信メール",
      "お問い合わせ番号",
      "受付番号",
      "お問い合わせ内容を確認しました",
      "内容を送信しました",
      "ご連絡を受け付けました",
      "フォームを送信しました",
      "正常に送信されました",
      "入力内容を受け付けました",
      "ご意見を受け付けました",
      "ご感想を受け付けました",
      "受付けました",
      "受付いたしました",
      "確認のメールをお送り",
      "お問い合わせを受け付け",
      "フォームは送信されました",
      "送信が完了",
      "お問い合わせありがとうございます",
      "お申し込みありがとうございます",
      "お申し込みを受け付け",
      "お問い合わせが完了",
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
      "we have received",
      "we received your",
      "has been submitted",
      "was submitted successfully",
      "email has been sent",
      "confirmation email",
      "your inquiry",
      "your request has been",
      "form has been submitted",
    ];

    for (const keyword of successKeywords) {
      const kw = keyword.toLowerCase();
      // URL変更があるか、差分テキストに新規キーワードが含まれている場合のみマッチ
      if (useFullText) {
        if (pageTextLower.includes(kw)) {
          log(`Success keyword detected (full page): "${keyword}"`);
          return true;
        }
      } else {
        if (checkText.includes(kw)) {
          log(`Success keyword detected (new text after submit): "${keyword}"`);
          return true;
        }
      }
    }

    return false;
  }

  // ボタンを探す
  function findButton(
    container: Element,
    selector: string,
    excludeKeywords: string[],
  ): HTMLElement | null {
    // :has-text は標準CSSではないので、手動で処理
    if (selector.includes(":has-text")) {
      const match = selector.match(/:has-text\("([^"]+)"\)/);
      if (match) {
        const text = match[1];
        const baseSelector = selector.replace(/:has-text\("[^"]+"\)/, "");
        const elements = container.querySelectorAll<HTMLElement>(
          baseSelector || "button",
        );

        for (const el of elements) {
          const elText =
            el.textContent?.toLowerCase() ||
            (el as HTMLInputElement).value?.toLowerCase() ||
            "";

          // 除外キーワードチェック
          if (excludeKeywords.some((kw) => elText.includes(kw.toLowerCase()))) {
            continue;
          }

          if (elText.includes(text.toLowerCase())) {
            // 非表示要素を除外
            if (el.offsetParent === null && el.style.display !== "contents") {
              continue;
            }
            return el;
          }
        }
        return null;
      }
    }

    try {
      const elements = container.querySelectorAll<HTMLElement>(selector);
      for (const el of elements) {
        const elText =
          el.textContent?.toLowerCase() ||
          (el as HTMLInputElement).value?.toLowerCase() ||
          "";

        // 除外キーワードチェック
        if (excludeKeywords.some((kw) => elText.includes(kw.toLowerCase()))) {
          continue;
        }

        // 非表示要素を除外
        if (el.offsetParent === null && el.style.display !== "contents") {
          continue;
        }

        return el;
      }
    } catch {
      // セレクタが無効な場合は無視
    }

    return null;
  }

  // ボタン情報を取得
  function getButtonInfo(button: HTMLElement): string {
    const tag = button.tagName.toLowerCase();
    const type = button.getAttribute("type") || "";
    const value = (button as HTMLInputElement).value || "";
    const text = button.textContent?.trim().substring(0, 30) || "";
    const id = button.id || "";
    return `<${tag} type="${type}" value="${value}" id="${id}">${text}</${tag}>`;
  }

  // 確認ページの処理
  async function handleConfirmationPage(): Promise<{
    success: boolean;
    finalUrl?: string;
    error?: string;
  }> {
    log("Checking for confirmation page...");

    // 少し待機（DOM安定化）
    await sleep(2000);

    // 成功ページの場合は終了
    if (isSuccessPage()) {
      return { success: true, finalUrl: window.location.href };
    }

    // 確認ページの最終送信ボタンを探す
    // 確認ボタン押下後のページなので "確認" 自体は除外しない（"入力内容を確認" のみ除外）
    const excludeKeywords = [
      "戻る",
      "back",
      "修正",
      "キャンセル",
      "cancel",
      "入力内容を確認",
      "入力画面に戻る",
      // 言語切替ボタンを除外
      "english",
      "中文",
      "한국어",
      "français",
      "deutsch",
      "español",
    ];

    const finalSubmitSelectors = [
      'input[type="submit"][value*="送信"]',
      'input[type="button"][value*="送信"]',
      'input[type="submit"][value*="完了"]',
      'input[type="submit"][value*="送る"]',
      'input[type="submit"][value*="上記"]',
      "#sendmail_btn",
      'button[type="submit"]',
      'input[type="submit"]',
      'input[type="button"][onclick*="submit" i]',
      'a[role="button"]',
      "a.btn",
      "a.button",
      'a[class*="submit"]',
      'a[class*="btn-primary"]',
    ];
    const clickedFinalButtons = new Set<HTMLElement>();

    for (const selector of finalSubmitSelectors) {
      const button = findButton(document.body, selector, excludeKeywords);
      if (button) {
        if (clickedFinalButtons.has(button)) {
          continue;
        }
        log(`Found final submit button: ${getButtonInfo(button)}`);
        await sleep(200);
        clickedFinalButtons.add(button);
        button.click();

        // ナビゲーション待機
        await waitForNavigation();

        // 成功ページチェック
        await sleep(1000);
        if (isSuccessPage()) {
          return { success: true, finalUrl: window.location.href };
        }
      }
    }

    // セレクタで見つからなかった場合、テキストベースでボタンを探索
    const submitTextKeywords = ["送信", "送る", "完了", "submit", "send"];
    // 言語コードパターン（2-3文字の国/言語コード）を除外
    const langCodePattern = /^[A-Z]{2,3}(-[A-Z]{2,3})?$/;
    const allPageButtons = document.querySelectorAll<HTMLElement>(
      'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], a.btn, a.button',
    );
    for (const btn of allPageButtons) {
      if (!isButtonVisible(btn)) continue;
      if (clickedFinalButtons.has(btn)) continue;
      const text = getButtonText(btn).trim();
      const textLower = text.toLowerCase();
      if (!text || text.length < 2) continue;
      // 言語コードパターン（JP, EN, 日本-JP等）を除外
      if (langCodePattern.test(text)) continue;
      if (/^[a-z]{2}-[a-z]{2}$/i.test(text)) continue;
      if (excludeKeywords.some((kw) => textLower.includes(kw.toLowerCase())))
        continue;
      if (
        submitTextKeywords.some((kw) => textLower.includes(kw.toLowerCase()))
      ) {
        log(
          `Found final submit button (text fallback on confirmation page): "${text}"`,
        );
        clickedFinalButtons.add(btn);
        btn.click();
        await waitForNavigation();
        await sleep(1000);
        if (isSuccessPage()) {
          return { success: true, finalUrl: window.location.href };
        }
        // URLが変化した場合は送信完了とみなす
        return { success: true, finalUrl: window.location.href };
      }
    }

    // ボタンが見つからなかった場合、もう一度成功ページをチェック
    await sleep(1000);
    if (isSuccessPage()) {
      return { success: true, finalUrl: window.location.href };
    }

    return {
      success: false,
      error: `確認ページ/最終送信ボタンが見つかりません（送信は成功している可能性あり） - URL: ${window.location.href}`,
    };
  }

  // 成功ページかどうか判定
  function isSuccessPage(): boolean {
    const url = window.location.href.toLowerCase();
    const body = document.body.textContent?.toLowerCase() || "";
    const title = document.title.toLowerCase();

    // URLで判定
    const successUrlPatterns = [
      "thanks",
      "thank-you",
      "thankyou",
      "thank_you",
      "success",
      "complete",
      "completed",
      "done",
      "finish",
      "finished",
      "sent",
      "submit_ok",
      "ok.html",
      "result",
    ];

    if (successUrlPatterns.some((pattern) => url.includes(pattern))) {
      log(`Success page detected via URL: ${url}`);
      return true;
    }

    // タイトルで判定（"送信" はフォームページ自体のタイトルにも含まれるため除外）
    const successTitlePatterns = [
      "ありがとう",
      "送信完了",
      "送信が完了",
      "受付完了",
      "thank",
      "complete",
    ];

    if (successTitlePatterns.some((pattern) => title.includes(pattern))) {
      log(`Success page detected via title: ${title}`);
      return true;
    }

    // 本文で判定
    const successTextPatterns = [
      "ありがとうございます",
      "ありがとうございました",
      "送信完了",
      "送信が完了",
      "送信されました",
      "受け付けました",
      "受付完了",
      "お問い合わせを受け付け",
      "お問合せを受け付け",
      "thank you for",
      "successfully submitted",
      "has been sent",
      "inquiry has been received",
    ];

    if (successTextPatterns.some((pattern) => body.includes(pattern))) {
      log(`Success page detected via body text`);
      return true;
    }

    return false;
  }

  // フォームプラグインの完了状態を検出
  // MW WP Form, Contact Form 7 等は同じURLで完了画面を表示する
  function checkFormPluginComplete(): boolean {
    // MW WP Form: 完了状態のクラス
    const mwComplete = document.querySelector(".mw_wp_form_complete");
    if (mwComplete) {
      log("MW WP Form completion state detected");
      return true;
    }

    // Contact Form 7: 送信成功メッセージ
    const cf7Success = document.querySelector(
      ".wpcf7-mail-sent-ok, .wpcf7-response-output.wpcf7-mail-sent-ok",
    );
    if (cf7Success) {
      log("Contact Form 7 success state detected");
      return true;
    }

    // CF7 v5+: data-status="mail_sent"
    const cf7Form = document.querySelector(
      '.wpcf7[data-status="mail_sent"], .wpcf7-form.sent',
    );
    if (cf7Form) {
      log("Contact Form 7 (v5+) mail_sent state detected");
      return true;
    }

    // Snow Monkey Forms: 完了画面
    const smfComplete = document.querySelector(
      ".smf-complete-content, .snow-monkey-form--complete",
    );
    if (smfComplete) {
      log("Snow Monkey Forms completion state detected");
      return true;
    }

    // 汎用: 完了メッセージを含む要素の検出
    const completeSelectors = [
      '[class*="complete"]',
      '[class*="thanks"]',
      '[class*="success"]',
      '[class*="sent"]',
    ];
    for (const sel of completeSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.textContent || "").trim();
        if (
          text.includes("ありがとう") ||
          text.includes("完了") ||
          text.includes("受け付け") ||
          text.includes("thank")
        ) {
          log(`Form plugin completion detected via selector: ${sel}`);
          return true;
        }
      }
    }

    return false;
  }

  // ナビゲーション待機
  function waitForNavigation(): Promise<void> {
    return new Promise((resolve) => {
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 10000); // タイムアウトを10秒に延長

      // URL変更を監視
      const currentUrl = window.location.href;
      const checkInterval = setInterval(() => {
        if (window.location.href !== currentUrl) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            // DOM安定化待ち
            setTimeout(resolve, 1500);
          }
        }
      }, 100);

      // DOM変更も監視（SPA対応）
      const observer = new MutationObserver(() => {
        // 大きなDOM変更があった場合
        const newBodyText = document.body.textContent?.toLowerCase() || "";
        if (
          newBodyText.includes("ありがとう") ||
          newBodyText.includes("送信完了") ||
          newBodyText.includes("thank you")
        ) {
          observer.disconnect();
          clearInterval(checkInterval);
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            setTimeout(resolve, 500);
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // クリーンアップ
      setTimeout(() => {
        observer.disconnect();
      }, 10000);
    });
  }

  // スリープ
  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // MutationObserverで新しいボタンの出現を待機
  async function waitForNewButton(
    excludeKeywords: string[],
    targetKeywords: string[],
    maxWaitMs: number = 5000,
  ): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      let resolved = false;
      const startTime = Date.now();

      // 既存のボタンを記録
      const existingButtons = new Set<HTMLElement>();
      document
        .querySelectorAll<HTMLElement>(
          'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], a.btn, a.button, a[class*="submit"], a[class*="btn-primary"]',
        )
        .forEach((btn) => {
          existingButtons.add(btn);
        });

      // ボタンを検索する関数
      const findTargetButton = (): HTMLElement | null => {
        const allButtons = document.querySelectorAll<HTMLElement>(
          'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], a.btn, a.button, a[class*="submit"], a[class*="btn-primary"]',
        );
        for (const btn of allButtons) {
          // 非表示ボタンをスキップ
          if (
            btn.offsetParent === null &&
            (btn as HTMLElement).style.display !== "contents"
          ) {
            continue;
          }

          const text = (
            btn.textContent?.trim() ||
            (btn as HTMLInputElement).value ||
            ""
          ).toLowerCase();

          // 除外キーワードチェック
          if (excludeKeywords.some((kw) => text.includes(kw.toLowerCase()))) {
            continue;
          }

          // ターゲットキーワードマッチ
          if (targetKeywords.some((kw) => text.includes(kw.toLowerCase()))) {
            return btn;
          }
        }
        return null;
      };

      // 定期的にボタンをチェック
      const checkInterval = setInterval(() => {
        if (resolved) return;

        const btn = findTargetButton();
        if (btn && !existingButtons.has(btn)) {
          // 新しいボタンが見つかった
          clearInterval(checkInterval);
          observer.disconnect();
          resolved = true;
          log(
            `[MutationObserver] New button found: "${btn.textContent?.trim() || (btn as HTMLInputElement).value}"`,
          );
          resolve(btn);
        }

        // タイムアウトチェック
        if (Date.now() - startTime > maxWaitMs) {
          clearInterval(checkInterval);
          observer.disconnect();
          if (!resolved) {
            resolved = true;
            // タイムアウトでも、条件に合うボタンがあれば返す
            const fallbackBtn = findTargetButton();
            resolve(fallbackBtn);
          }
        }
      }, 200);

      // DOM変更を監視
      const observer = new MutationObserver(() => {
        if (resolved) return;

        const btn = findTargetButton();
        if (btn && !existingButtons.has(btn)) {
          clearInterval(checkInterval);
          observer.disconnect();
          resolved = true;
          log(
            `[MutationObserver] New button found via mutation: "${btn.textContent?.trim() || (btn as HTMLInputElement).value}"`,
          );
          resolve(btn);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "disabled", "hidden"],
      });

      // タイムアウト
      setTimeout(() => {
        if (!resolved) {
          clearInterval(checkInterval);
          observer.disconnect();
          resolved = true;
          const fallbackBtn = findTargetButton();
          resolve(fallbackBtn);
        }
      }, maxWaitMs);
    });
  }

  // 初期化ログ
  log("Form handler content script loaded (scoring-based search)");
})(); // IIFE終了
