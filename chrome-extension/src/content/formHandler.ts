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
      const form = findContactForm();
      const hasForm = !!form;

      console.log(
        `[Apotto Content] CHECK_FOR_FORM result: hasForm=${hasForm}`,
        debugInfo,
      );
      sendResponse({
        success: true,
        hasForm,
        debugInfo,
      });
      return false;
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
      'button, input[type="submit"], input[type="button"]',
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

    return {
      url: window.location.href,
      title: document.title,
      formCount: forms.length,
      inputCount: inputs.length,
      textareaCount: textareas.length,
      hasEmailField: emailFields.length > 0,
      iframeCount: iframes.length,
      buttonCount: buttons.length,
      buttonTexts: buttonTexts.slice(0, 10), // 最大10件
      hasConfirmButton: confirmButtons.length > 0,
      confirmButtonCount: confirmButtons.length,
      hasSubmitButton: submitButtons.length > 0,
      submitButtonCount: submitButtons.length,
      readyState: document.readyState,
      timestamp: new Date().toISOString(),
    };
  }

  // ===== お問い合わせページ検索機能（サーバー側と同等） =====
  async function findContactPageCandidates(): Promise<string[]> {
    const candidates: string[] = [];
    const seen = new Set<string>();

    // 現在のページを最初に追加
    const currentUrl = window.location.href;
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
          if (href && !seen.has(href) && isSameOrigin(href)) {
            log(`Found contact link via selector ${selector}: ${href}`);
            candidates.push(href);
            seen.add(href);
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
      "資料請求",
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

      if (!href || seen.has(href) || !isSameOrigin(href)) continue;

      for (const pattern of textPatterns) {
        if (text.includes(pattern)) {
          log(`Found contact link via text "${pattern}": ${href}`);
          candidates.push(href);
          seen.add(href);
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

        if (!href || seen.has(href) || !isSameOrigin(href)) continue;

        if (
          text.includes("問い合わせ") ||
          text.includes("contact") ||
          text.includes("inquiry") ||
          href.includes("contact") ||
          href.includes("inquiry")
        ) {
          log(`Found nav contact link: ${href}`);
          candidates.push(href);
          seen.add(href);
        }
      }
    }

    // 4. 一般的なパスパターンを追加
    const url = new URL(currentUrl);
    const base = `${url.protocol}//${url.host}`;
    const pathCandidates = [
      // ★ NEW: その他問い合わせパターン（最優先）
      "/contact/other/",
      "/contact/other",
      "/contact/others/",
      "/contact/others",
      "/contact/others/form/",
      "/contact/others/form.html",
      "/contact/other/form/",
      "/contact/other/form.html",
      "/contact/form.php?type=service",
      "/contact/form.php?type=other",
      "/inquiry/other/",
      "/inquiry/other",
      "/inquiry/others/",
      "/inquiry/others",
      // ★ NEW: ハイフン区切りパターン
      "/contact-other/",
      "/contact-other",
      "/contact-others/",
      "/contact-others",
      "/inquiry-other/",
      "/inquiry-other",
      "/inquiry-others/",
      "/inquiry-others",
      "/form-other/",
      "/form-other",
      "/form-others/",
      "/form-others",
      // ★ NEW: アンダーバー区切りパターン
      "/contact_other/",
      "/contact_other",
      "/contact_others/",
      "/contact_others",
      "/inquiry_other/",
      "/inquiry_other",
      "/inquiry_others/",
      "/inquiry_others",
      "/form_other/",
      "/form_other",
      "/form_others/",
      "/form_others",
      // contactパターン
      "/contact",
      "/contact/",
      "/contact/index.html",
      "/contact/form.html",
      // inquiryパターン
      "/inquiry",
      "/inquiry/",
      "/inquiry/index.html",
      "/inquiry/office.html",
      "/inquiry/form.html",
      "/inquiry/contact.html",
      // 日本語パターン
      "/toiawase",
      "/toiawase/",
      "/otoiawase",
      "/otoiawase/",
      "/お問い合わせ",
      "/お問い合わせ/",
      // その他
      "/form",
      "/form/",
      "/form/contact",
      "/form/contact/",
      "/form/contactus",
      "/form/contactus/",
      "/form/inquiry",
      "/form/inquiry/",
      "/form/other/",
      "/form/other",
      "/form/others/",
      "/form/others",
      "/contact-us",
      "/contact-us/",
      "/contactus",
      "/contactus/",
    ];

    for (const path of pathCandidates) {
      const fullUrl = `${base}${path}`;
      if (!seen.has(fullUrl)) {
        candidates.push(fullUrl);
        seen.add(fullUrl);
      }
    }

    log(`Found ${candidates.length} contact page candidates`);
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

  // フォーム送信処理（強化版）
  async function handleFormSubmission(
    item: QueueItem,
  ): Promise<{
    success: boolean;
    finalUrl?: string;
    error?: string;
    debugLogs?: string[];
    debugInfo?: Record<string, unknown>;
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

      // 3. 確認ボタンまたは送信ボタンを押す
      const submitResult = await submitForm(form);
      if (!submitResult.success) {
        return {
          success: false,
          error: submitResult.error,
          debugLogs: getDebugLogs(),
        };
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

      // 確認ページの場合、最終送信ボタンを探す
      const finalSubmitResult = await handleConfirmationPage();
      return { ...finalSubmitResult, debugLogs: getDebugLogs() };
    } catch (error) {
      // DOMExceptionの詳細情報を取得
      let errorMessage = "Unknown error";
      if (error instanceof DOMException) {
        errorMessage = `DOMException: ${error.name} - ${error.message}`;
        log(
          `DOMException details: name=${error.name}, message=${error.message}`,
        );
      } else if (error instanceof Error) {
        errorMessage = error.message;
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
      'button, input[type="submit"], input[type="button"]',
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

    const candidates: FormCandidate[] = [];

    // 1. フォームタグを持つ要素を評価
    const forms = document.querySelectorAll<HTMLFormElement>("form");
    for (const form of forms) {
      const result = scoreFormCandidate(form);
      if (result.score > 0) {
        candidates.push({ element: form, ...result });
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

    // 3. スコアでソートして最良の候補を選択
    candidates.sort((a, b) => b.score - a.score);

    // 動的スコア閾値: フォームの入力フィールド数に応じて調整
    // 入力フィールドが少ない（シンプルなフォーム）場合は閾値を下げる
    const calculateMinScore = (element: Element): number => {
      const inputCount = element.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
      ).length;

      // シンプルなフォーム（2-3フィールド）: 閾値30
      // 標準的なフォーム（4-6フィールド）: 閾値40
      // 大きなフォーム（7+フィールド）: 閾値50
      if (inputCount <= 3) return 30;
      if (inputCount <= 6) return 40;
      return 50;
    };

    if (candidates.length > 0) {
      const best = candidates[0];
      const MIN_FORM_SCORE = calculateMinScore(best.element);
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
      'input[type="email"], input[name*="mail" i]',
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
    ];
    const buttons = container.querySelectorAll(
      'button, input[type="submit"], input[type="button"]',
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
      'button, input[type="submit"], input[type="button"]',
    );

    for (const btn of buttons) {
      const text = (
        btn.textContent ||
        (btn as HTMLInputElement).value ||
        ""
      ).toLowerCase();
      const isFormButton = formButtonKeywords.some((kw) =>
        text.includes(kw.toLowerCase()),
      );

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
  ): HTMLInputElement | HTMLSelectElement | null {
    // すべてのラベルを検索
    const labels = container.querySelectorAll<HTMLLabelElement>("label");

    for (const label of labels) {
      const text = label.textContent?.trim().toLowerCase() || "";
      const searchText = labelText.toLowerCase();

      // ラベルのテキストが一致するか確認
      if (text.includes(searchText) || searchText.includes(text)) {
        // 1. label の for 属性から input を探す
        const forAttr = label.getAttribute("for");
        if (forAttr) {
          const field = container.querySelector<
            HTMLInputElement | HTMLSelectElement
          >(`#${forAttr}`);
          if (field) {
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
          const field = container.querySelector<HTMLTextAreaElement>(
            `#${forAttr}`,
          );
          if (field && field.tagName === "TEXTAREA") {
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
    // フィールドマッピング（サーバー側と同等に拡充）
    const fieldMappings: {
      value?: string;
      selectors: string[];
      labelTexts?: string[];
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
        labelTexts: ["会社名", "企業名", "法人名", "組織名", "company"],
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
          "ご担当者名",
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
        labelTexts: ["フリガナ", "ふりがな", "カナ", "よみ"],
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
          "メールアドレス再入力",
          "メール再入力",
          "確認用",
          "再入力",
          "もう一度",
          "メールアドレス（確認）",
          "E-mail（確認）",
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
        labelTexts: ["電話番号", "TEL", "連絡先", "phone"],
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
      },
      // 都道府県
      {
        value: data.prefecture,
        selectors: [
          'select[name*="pref" i]',
          'select[name*="ken" i]',
          'select[name*="todofuken" i]',
          'input[name*="pref" i]',
          'input[name*="ken" i]',
          'input[placeholder*="都道府県" i]',
          'select[id*="pref" i]',
        ],
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
      },
      // 住所
      {
        value: data.address,
        selectors: [
          'input[name*="address" i]:not([name*="mail" i])',
          'input[name*="jusho" i]',
          'input[name*="address2" i]',
          'input[name*="street" i]',
          'input[placeholder*="住所" i]',
          'input[placeholder*="番地" i]',
          'input[id*="address" i]:not([id*="mail" i])',
        ],
        labelTexts: ["住所", "所在地", "address"],
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
    ];

    // 各フィールドに入力
    for (const mapping of fieldMappings) {
      if (!mapping.value) continue;

      let filled = false;

      // 1. セレクターで検索
      for (const selector of mapping.selectors) {
        try {
          const field = form.querySelector<
            HTMLInputElement | HTMLSelectElement
          >(selector);
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
          const field = findFieldByLabel(form, labelText);
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
          "問い合わせ内容",
          "メッセージ",
          "内容",
          "ご意見",
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

    // 各グループの最初の項目をチェック
    for (const groupName of checkboxGroups) {
      const groupCheckboxes = form.querySelectorAll<HTMLInputElement>(
        `input[type="checkbox"][name="${groupName}[]"]`,
      );

      // すでにチェックされているか確認
      const anyChecked = Array.from(groupCheckboxes).some((cb) => cb.checked);

      if (!anyChecked && groupCheckboxes.length > 0) {
        // 最初の項目をチェック
        const firstCheckbox = groupCheckboxes[0];
        firstCheckbox.click();
        const label =
          firstCheckbox.closest("label")?.textContent?.trim() ||
          firstCheckbox.value;
        log(`Checked first checkbox in group "${groupName}": ${label}`);
        await sleep(100);
      }
    }

    // 2. 必須チェックボックス（同意など）にチェック
    const requiredCheckboxSelectors = [
      'input[type="checkbox"][required]',
      'input[type="checkbox"][name*="agree" i]',
      'input[type="checkbox"][name*="privacy" i]',
      'input[type="checkbox"][name*="consent" i]',
      'input[type="checkbox"][name*="terms" i]',
      'input[type="checkbox"][name*="policy" i]',
      'input[type="checkbox"][name*="doui" i]',
      'input[type="checkbox"][id*="agree" i]',
      'input[type="checkbox"][id*="privacy" i]',
    ];

    for (const selector of requiredCheckboxSelectors) {
      const checkboxes = form.querySelectorAll<HTMLInputElement>(selector);
      for (const checkbox of checkboxes) {
        if (!checkbox.checked) {
          // チェックボックスが無効化されている場合、スクロールして有効化を試みる
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
          log(`Checked required checkbox: ${selector}`);
          await sleep(50);
        }
      }
    }

    // セレクトボックスの処理（未選択のものに最初の有効なオプションを選択）
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
            select.value = option.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            log(
              `Selected option: ${option.value} (${option.textContent?.trim()})`,
            );
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
      const groupRadios = form.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${groupName}"]`,
      );
      const anyChecked = Array.from(groupRadios).some((r) => r.checked);

      if (!anyChecked && groupRadios.length > 0) {
        // 「その他」以外の最初のオプションを選択
        for (const radio of groupRadios) {
          const label = radio.closest("label")?.textContent?.trim() || "";
          if (
            !label.includes("その他") &&
            !label.toLowerCase().includes("other")
          ) {
            radio.click();
            log(`Selected radio: ${groupName} = ${radio.value}`);
            break;
          }
        }
      }
    }
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
    const nameLower = fieldName.toLowerCase();

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

    // 1-2. ラベルで判定（name属性で判定できなかった場合のみ）
    if (!isKanaField) {
      let labelText = "";

      // label[for]から取得
      if (fieldId) {
        const label = document.querySelector<HTMLLabelElement>(
          `label[for="${fieldId}"]`,
        );
        if (label) {
          labelText = label.textContent?.trim().toLowerCase() || "";
        }
      }

      // dt/ddパターンから取得
      if (!labelText) {
        const dtParent = field.closest("dd")?.previousElementSibling;
        if (dtParent && dtParent.tagName === "DT") {
          labelText = dtParent.textContent?.trim().toLowerCase() || "";
        }
      }

      // ラベルにふりがな関連のキーワードがあるか
      if (labelText) {
        isKanaField =
          labelText.includes("ふりがな") ||
          labelText.includes("ふりがな") ||
          labelText.includes("よみ") ||
          labelText.includes("カナ") ||
          labelText === "せい" ||
          labelText === "めい";
      }
    }

    // ふりがなフィールドでない場合は変換しない
    if (!isKanaField) {
      return "auto";
    }

    // ============================================
    // Step 2: ひらがな or カタカナを判定
    // ============================================

    // 2-1. ラベルテキストから判定
    if (fieldId) {
      const label = document.querySelector<HTMLLabelElement>(
        `label[for="${fieldId}"]`,
      );
      if (label) {
        const labelText = label.textContent || "";
        // ひらがな判定
        if (
          labelText.includes("ふりがな") ||
          labelText.includes("よみ") ||
          labelText === "せい" ||
          labelText === "めい"
        ) {
          return "hiragana";
        }
        // カタカナ判定
        if (
          labelText.includes("フリガナ") ||
          labelText.includes("ヨミ") ||
          labelText.includes("カナ") ||
          labelText === "セイ" ||
          labelText === "メイ"
        ) {
          return "katakana";
        }
      }
    }

    // 2-2. dt/ddパターンから判定
    const dtParent = field.closest("dd")?.previousElementSibling;
    if (dtParent && dtParent.tagName === "DT") {
      const dtText = dtParent.textContent || "";
      // ひらがな判定
      if (
        dtText.includes("ふりがな") ||
        dtText.includes("よみ") ||
        dtText === "せい" ||
        dtText === "めい"
      ) {
        return "hiragana";
      }
      // カタカナ判定
      if (
        dtText.includes("フリガナ") ||
        dtText.includes("ヨミ") ||
        dtText.includes("カナ") ||
        dtText === "セイ" ||
        dtText === "メイ"
      ) {
        return "katakana";
      }
    }

    // 2-3. placeholderから判定
    if (field instanceof HTMLInputElement) {
      const placeholder = field.placeholder || "";
      // ひらがな判定
      if (
        placeholder.includes("ふりがな") ||
        placeholder.includes("よみ") ||
        placeholder === "せい" ||
        placeholder === "めい"
      ) {
        return "hiragana";
      }
      // カタカナ判定
      if (
        placeholder.includes("フリガナ") ||
        placeholder.includes("カナ") ||
        placeholder === "セイ" ||
        placeholder === "メイ"
      ) {
        return "katakana";
      }
    }

    // 2-4. デフォルト（name属性にkanaが含まれる場合はカタカナ）
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
      // セレクトボックス
      const options = field.querySelectorAll("option");
      for (const option of options) {
        if (option.value === value || option.textContent?.trim() === value) {
          field.value = option.value;
          field.dispatchEvent(new Event("change", { bubbles: true }));
          break;
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

      // 3. compositionend イベント（IME入力完了）
      field.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          data: finalValue,
        }),
      );
      await sleep(10);

      // 4. change イベント
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // ブラー
    field.blur();
    field.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

    // 少し待機（フレームワークのState更新を待つ）
    await sleep(150);
  }

  // 送信ボタンを探して押す
  async function submitForm(
    form: HTMLFormElement | Element,
  ): Promise<{ success: boolean; error?: string }> {
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
      'button, input[type="submit"], input[type="button"]',
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

      // 短い待機後、成功ページをチェック
      await sleep(500);

      // URL変更による成功判定
      const urlAfter = window.location.href;
      if (checkSuccessUrl(urlAfter)) {
        log(`✅ Success page detected by URL: ${urlAfter}`);
        return { success: true };
      }

      // ページ内テキストによる成功判定
      if (checkSuccessText()) {
        log(`✅ Success detected by page text`);
        return { success: true };
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
          return { success: true };
        }

        if (checkSuccessText()) {
          log(`✅ Success detected by page text`);
          return { success: true };
        }

        // 成功判定できない場合でも、ボタンをクリックできたら成功とみなす
        log(`✅ Submit button clicked successfully`);
        return { success: true };
      }

      // フォールバック: MutationObserverで見つからない場合、手動でページを再スキャン
      log(`MutationObserver timeout, falling back to manual search...`);
      await sleep(1000);

      const allPageButtons = document.querySelectorAll<HTMLElement>(
        'button, input[type="submit"], input[type="button"]',
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
            return { success: true };
          }

          log(`✅ Submit button clicked`);
          return { success: true };
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
            return { success: true };
          }

          log(`✅ Submit button clicked`);
          return { success: true };
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

      // 「送信」が含まれていれば送信ボタン
      if (
        text.includes("送信") ||
        textLower.includes("submit") ||
        textLower.includes("send")
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
      log(`Clicking submit button: ${getButtonInfo(submitButton)}`);
      submitButton.click();
      log(`Waiting for submission completion (2s)...`);
      await sleep(2000); // 送信完了を待つ（延長）

      // 送信後の成功判定
      const urlAfter = window.location.href;
      if (checkSuccessUrl(urlAfter)) {
        log(`✅ Success page detected by URL: ${urlAfter}`);
        return { success: true };
      }

      if (checkSuccessText()) {
        log(`✅ Success detected by page text`);
        return { success: true };
      }

      // 成功判定できない場合でも、ボタンをクリックできたら成功とみなす
      log(`✅ Submit button clicked successfully`);
      return { success: true };
    }

    // フォーム内に見つからない場合、ドキュメント全体からも探す
    log(`No button found in form, searching in entire document...`);
    const allDocButtons = document.querySelectorAll<HTMLElement>(
      'button, input[type="submit"], input[type="button"]',
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
          return { success: true };
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
            return { success: true };
          }

          log(`✅ Final submit button clicked`);
          return { success: true };
        }

        // フォールバック: 従来の方法でも探す
        log(`MutationObserver timeout, falling back to manual search...`);
        await sleep(1000);

        const allDocButtonsRefresh = document.querySelectorAll<HTMLElement>(
          'button, input[type="submit"], input[type="button"]',
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
            submitTextLower.includes("submit") ||
            submitTextLower.includes("send")
          ) {
            log(`Found final submit button (fallback): "${submitText}"`);
            submitBtn.click();
            await sleep(2000);

            if (checkSuccessUrl(window.location.href) || checkSuccessText()) {
              log(`✅ Success after final submit`);
              return { success: true };
            }

            log(`✅ Final submit button clicked`);
            return { success: true };
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
        textLower.includes("submit") ||
        textLower.includes("send")
      ) {
        log(`Found submit button in document: "${text}"`);
        btn.click();
        await sleep(2000);

        if (checkSuccessUrl(window.location.href) || checkSuccessText()) {
          log(`✅ Success after submit`);
          return { success: true };
        }

        log(`✅ Submit button clicked`);
        return { success: true };
      }
    }

    log(`❌ No submit/confirm button found`);
    return {
      success: false,
      error: "送信ボタンまたは確認ボタンが見つかりません",
    };
  }

  // ボタンのテキストを取得
  function getButtonText(button: HTMLElement | null | undefined): string {
    if (!button) return "";
    if (button instanceof HTMLInputElement) {
      return button.value || "";
    }
    return button.textContent?.trim() || "";
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

  // ページ内テキストによる成功判定
  function checkSuccessText(): boolean {
    const pageText = document.body.textContent || "";
    const pageTextLower = pageText.toLowerCase();

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
      if (pageTextLower.includes(keyword.toLowerCase())) {
        log(`Success keyword detected: "${keyword}"`);
        return true;
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
    const excludeKeywords = [
      "戻る",
      "back",
      "修正",
      "キャンセル",
      "cancel",
      "確認",
      "confirm",
    ];

    const finalSubmitSelectors = [
      'input[type="submit"][value*="送信"]',
      'input[type="button"][value*="送信"]',
      "#sendmail_btn",
      'button:has-text("送信")',
      'input[type="submit"]:not([value*="確認"])',
      // ★ FIXED: :not(:has-text(...)) は動かないため削除
      // 'button[type="submit"]:not(:has-text("確認"))',
      'button[type="submit"]', // テキストチェックはfindButton関数のexcludeKeywordsで処理
      'input[type="button"][onclick*="submit" i]',
    ];

    for (const selector of finalSubmitSelectors) {
      const button = findButton(document.body, selector, excludeKeywords);
      if (button) {
        log(`Found final submit button: ${getButtonInfo(button)}`);
        await sleep(200);
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

    // ボタンが見つからなかった場合、もう一度成功ページをチェック
    await sleep(1000);
    if (isSuccessPage()) {
      return { success: true, finalUrl: window.location.href };
    }

    return { success: false, error: "最終送信ボタンが見つかりません" };
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

    // タイトルで判定
    const successTitlePatterns = [
      "ありがとう",
      "完了",
      "送信",
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
          'button, input[type="submit"], input[type="button"]',
        )
        .forEach((btn) => {
          existingButtons.add(btn);
        });

      // ボタンを検索する関数
      const findTargetButton = (): HTMLElement | null => {
        const allButtons = document.querySelectorAll<HTMLElement>(
          'button, input[type="submit"], input[type="button"]',
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
