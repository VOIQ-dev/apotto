/**
 * Jina AI Reader API を使った高精度なWebページ解析
 * マークダウン形式で構造化されたコンテンツを取得
 */

type CrawlOptions = {
  maxPages?: number;
  maxDepth?: number;
  sameOriginOnly?: boolean;
  timeout?: number;
};

const JINA_READER_API = "https://r.jina.ai";
const DEFAULT_TIMEOUT = 30000;

export async function crawlAndSummarizeSafe(
  startUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  options: CrawlOptions = {},
): Promise<string> {
  try {
    // Jina AI Reader APIを使ってページを解析
    const result = await fetchWithJinaReader(startUrl);
    return formatJinaResultForPrompt(result, startUrl);
  } catch (error) {
    console.warn(
      "Jina Reader failed, falling back to basic fetch:",
      (error as Error)?.message ?? error,
    );
    // Jina失敗時は基本的なfetchで試行
    try {
      const fallback = await basicFetch(startUrl);
      return fallback;
    } catch {
      return `URL: ${startUrl}\n（サイト解析に失敗したため、URL情報のみで生成します）`;
    }
  }
}

async function fetchWithJinaReader(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    // Jina AI Reader APIはURLの前にr.jina.aiを付けるだけで動作
    const jinaUrl = `${JINA_READER_API}/${url}`;
    const response = await fetch(jinaUrl, {
      headers: {
        Accept: "text/plain",
        "X-Return-Format": "markdown",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Jina Reader API returned ${response.status}`);
    }

    const markdown = await response.text();
    return markdown;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function basicFetch(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; apotto/1.0; +https://apotto.example.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const text = extractPlainText(html);
    return `URL: ${url}\n\n${text.slice(0, 2000)}`;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatJinaResultForPrompt(markdown: string, url: string): string {
  // Jinaが返すマークダウンから企業情報を抽出して自然な文章に整形
  const lines = markdown.split("\n");

  // ページタイトルを抽出
  const title =
    lines
      .find((line) => line.startsWith("# "))
      ?.replace("# ", "")
      .trim() || "";

  // 画像リンク、特殊記号、URLなどを除去してクリーンなテキストに
  const cleanedLines = lines
    .map((line) => {
      // マークダウンのリンクを除去 [text](url) -> text
      let cleaned = line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      // 画像構文を除去 ![alt](url) -> ''
      cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
      // HTMLタグを除去
      cleaned = cleaned.replace(/<[^>]+>/g, "");
      // 連続する記号を除去
      cleaned = cleaned.replace(/[=\-_]{3,}/g, "");
      // URLを除去
      cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, "");
      return cleaned.trim();
    })
    .filter((line) => {
      // 空行、見出し記号のみ、短すぎる行を除外
      return (
        line.length > 0 &&
        !line.match(/^#+\s*$/) &&
        line.length > 5 &&
        !line.match(/^[\s\*\-\[\]]+$/)
      );
    });

  // 見出しとコンテンツを構造的に整理
  const sections: Array<{ heading: string; content: string[] }> = [];
  let currentHeading = "";
  let currentContent: string[] = [];

  for (const line of cleanedLines) {
    if (line.startsWith("## ") || line.startsWith("### ")) {
      if (currentHeading && currentContent.length > 0) {
        sections.push({ heading: currentHeading, content: currentContent });
      }
      currentHeading = line.replace(/^#+ /, "").trim();
      currentContent = [];
    } else if (currentHeading) {
      currentContent.push(line);
    }
  }
  if (currentHeading && currentContent.length > 0) {
    sections.push({ heading: currentHeading, content: currentContent });
  }

  // 企業情報として有用なセクションを抽出
  const relevantKeywords = [
    "サービス",
    "製品",
    "特徴",
    "強み",
    "会社概要",
    "about",
    "service",
    "product",
    "feature",
    "事業",
    "ソリューション",
    "ミッション",
    "ビジョン",
    "バリュー",
  ];

  const relevantSections = sections.filter((section) =>
    relevantKeywords.some((keyword) =>
      section.heading.toLowerCase().includes(keyword.toLowerCase()),
    ),
  );

  // 自然な文章形式でフォーマット
  const parts: string[] = [];

  parts.push(`企業URL: ${url}`);

  if (title) {
    parts.push(`企業名/サイトタイトル: ${title}`);
  }

  if (relevantSections.length > 0) {
    parts.push("\n【企業の特徴・事業内容】");
    relevantSections.slice(0, 4).forEach((section) => {
      const contentText = section.content
        .slice(0, 5)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (contentText.length > 20) {
        parts.push(`- ${section.heading}: ${contentText.slice(0, 200)}`);
      }
    });
  } else {
    // 関連セクションが見つからない場合は冒頭の本文を使用
    const bodyText = cleanedLines
      .filter((line) => !line.startsWith("#"))
      .slice(0, 10)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (bodyText.length > 30) {
      parts.push(`\n【サイト概要】\n${bodyText.slice(0, 300)}`);
    }
  }

  const result = parts.join("\n");

  // 最終的なクリーンアップと文字数制限
  const finalResult = result.replace(/\n{3,}/g, "\n\n").trim();

  if (finalResult.length > 2000) {
    return finalResult.slice(0, 2000) + "...（以下省略）";
  }

  return finalResult || `企業URL: ${url}\n（詳細情報の抽出に失敗しました）`;
}
