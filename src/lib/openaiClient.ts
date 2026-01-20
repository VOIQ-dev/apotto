import OpenAI from "openai";
import type {
  Response as OpenAIResponse,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
} from "openai/resources/responses/responses";

import {
  MISSING_FIELD_PLACEHOLDER,
  isPlaceholderValue,
} from "@/lib/placeholders";
import {
  ProductContext,
  formatProductContextForPrompt,
} from "@/lib/productContext";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RAW_OPENAI_API_URL = process.env.OPENAI_API_URL;
const DEFAULT_MODEL = process.env.OPENAI_SALES_MODEL ?? "gpt-5-mini";
const ALLOWED_MODELS = new Set(["gpt-5-mini", "gpt-5-nano"]);
const FALLBACK_MODEL: Record<string, string | undefined> = {
  "gpt-5-mini": "gpt-5-nano",
};
const REASONING_SUPPORTED_MODELS = new Set(["gpt-5-mini", "gpt-5"]);

const OPENAI_BASE_URL = RAW_OPENAI_API_URL
  ? RAW_OPENAI_API_URL.replace(/\/responses$/, "")
  : undefined;

let cachedClient: OpenAI | null = null;

type SenderProfile = {
  companyName: string;
  department?: string;
  title?: string;
  fullName: string;
  email: string;
  phone?: string;
  postalCode?: string;
  prefecture?: string;
  city?: string;
  address?: string;
  building?: string;
  subject: string;
  meetingUrl?: string; // 商談日程URL（任意）
};

type RecipientProfile = {
  companyName?: string;
  department?: string;
  title?: string;
  contactName?: string;
  email?: string;
};

type AttachmentDescriptor = {
  name: string;
  url: string;
  token?: string;
};

export type SalesCopyRequest = {
  model?: string;
  sender: SenderProfile;
  recipient: RecipientProfile;
  homepageUrl: string;
  siteSummary: string;
  notes?: string;
  attachments?: AttachmentDescriptor[];
  tone?: "friendly" | "formal" | "casual";
  language?: "ja" | "en";
  productContext?: ProductContext;
};

export type SalesCopyResponse = {
  text: string;
  raw: unknown;
};

class ConfigurationError extends Error {
  constructor() {
    super("OPENAI_API_KEY が未設定です。環境変数を設定してください。");
    this.name = "ConfigurationError";
  }
}

function getOpenAIClient(): OpenAI {
  if (!OPENAI_API_KEY) {
    throw new ConfigurationError();
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL,
    });
  }
  return cachedClient;
}

export async function generateSalesCopy(
  input: SalesCopyRequest,
): Promise<SalesCopyResponse> {
  const client = getOpenAIClient();
  const prompt = buildPrompt(input);
  const requestedModel = input.model ?? DEFAULT_MODEL;

  if (!ALLOWED_MODELS.has(requestedModel)) {
    throw new Error(
      `サポートされていないモデルです。使用可能なモデル: ${Array.from(
        ALLOWED_MODELS,
      ).join(", ")}`,
    );
  }

  const execute = async (modelName: string) => {
    console.info("[OpenAI] Sending request", {
      model: modelName,
      tone: input.tone ?? "friendly",
      language: input.language ?? "ja",
    });
    const allowTemperature = !REASONING_SUPPORTED_MODELS.has(modelName);
    const payload: ResponseCreateParamsNonStreaming = {
      model: modelName,
      input: prompt,
      max_output_tokens: 1500,
      ...(allowTemperature ? { temperature: 0.4 } : {}),
      stream: false,
    };

    if (REASONING_SUPPORTED_MODELS.has(modelName)) {
      payload.reasoning = { effort: "low" };
      payload.text = { format: { type: "text" } };
    }

    const response: OpenAIResponse = await client.responses.create(payload);
    console.info("[OpenAI] Response received", {
      model: modelName,
      finish_reason: response.usage?.output_tokens ? "completed" : "unknown",
      outputTokens: response.usage?.output_tokens,
    });
    const text = response.output_text?.trim();
    if (!text) {
      throw new Error("OpenAI APIの応答から文章を取得できませんでした。");
    }
    return { text, raw: response };
  };

  try {
    return await execute(requestedModel);
  } catch (error: unknown) {
    if (
      error instanceof OpenAI.APIError &&
      error.status === 429 &&
      (error.error?.code === "insufficient_quota" ||
        error.error?.code === "rate_limit_exceeded")
    ) {
      const fallback = FALLBACK_MODEL[requestedModel];
      if (fallback) {
        console.warn("[OpenAI] Primary model quota issue, falling back", {
          primary: requestedModel,
          fallback,
          status: error.status,
          code: error.error?.code,
        });
        return await execute(fallback);
      }
    }

    if (error instanceof OpenAI.APIError) {
      console.error("[OpenAI] API error", {
        model: requestedModel,
        status: error.status,
        code: error.error?.code,
        message: error.message,
      });
      throw new Error(
        `OpenAI API呼び出しに失敗しました: ${error.status ?? ""} ${
          error.message
        }`,
      );
    }
    console.error("[OpenAI] Unexpected error", error);
    throw error;
  }
}

// Streaming version: yields text deltas as they arrive
export async function* generateSalesCopyStream(
  input: SalesCopyRequest,
): AsyncIterable<string> {
  const client = getOpenAIClient();
  const prompt = buildPrompt(input);
  const requestedModel = input.model ?? DEFAULT_MODEL;
  if (!ALLOWED_MODELS.has(requestedModel)) {
    throw new Error(
      `サポートされていないモデルです。使用可能なモデル: ${Array.from(
        ALLOWED_MODELS,
      ).join(", ")}`,
    );
  }

  const allowTemperature = !REASONING_SUPPORTED_MODELS.has(requestedModel);
  const payload: ResponseCreateParamsStreaming = {
    model: requestedModel,
    input: prompt,
    max_output_tokens: 1500,
    ...(allowTemperature ? { temperature: 0.4 } : {}),
    ...(REASONING_SUPPORTED_MODELS.has(requestedModel)
      ? {
          reasoning: { effort: "low" },
          text: { format: { type: "text" } },
        }
      : {}),
    stream: true,
  };

  type SalesCopyStreamEvent = {
    type?: string;
    delta?: unknown;
    output_text?: unknown;
  };

  const stream = (await client.responses.create(
    payload,
  )) as unknown as AsyncIterable<SalesCopyStreamEvent>;

  for await (const event of stream) {
    // responses streaming delivers delta chunks
    if (event?.type === "response.output_text.delta" && event?.delta) {
      yield String(event.delta);
    } else if (typeof event?.output_text === "string") {
      yield event.output_text;
    }
  }
}

function buildPrompt({
  sender,
  recipient,
  homepageUrl,
  siteSummary,
  notes,
  attachments = [],
  tone = "friendly",
  language = "ja",
  productContext,
}: SalesCopyRequest) {
  const toneLabel =
    tone === "formal"
      ? "丁寧でフォーマル"
      : tone === "casual"
        ? "カジュアルで親しみやすい"
        : "ビジネスライクかつ親しみやすい";
  const langLabel = language === "en" ? "英語" : "日本語";

  // 敬称の組み立て（担当者名 or 部署 or 企業名）
  const recipientGreeting = !isPlaceholderValue(recipient.contactName)
    ? `${recipient.contactName}様`
    : !isPlaceholderValue(recipient.department)
      ? `${recipient.department}ご担当者様`
      : !isPlaceholderValue(recipient.companyName)
        ? `${recipient.companyName}ご担当者様`
        : "ご担当者様";

  const sampleSubject = !isPlaceholderValue(sender.subject)
    ? sender.subject
    : "ご提案";

  const attachmentBlock =
    attachments.length > 0
      ? attachments
          .map(
            (attachment, index) =>
              `${index + 1}. ${attachment.name}: ${attachment.url}`,
          )
          .join("\n")
      : "";

  const attachmentSection =
    attachments.length > 0
      ? `
## 提案資料
以下の資料を本文内で自然に紹介してください：
${attachmentBlock}
`
      : "";

  const notesSection = notes?.trim()
    ? `
## 追加の提案ポイント・メモ
${notes.trim()}
`
    : "";

  const productContextText = formatProductContextForPrompt(productContext);
  const productContextSection = productContextText
    ? `
## 自社プロダクト・営業戦略コンテキスト
${productContextText}
`
    : "";

  const structuredInput = JSON.stringify(
    {
      sender,
      recipient,
      homepageUrl,
      siteSummary,
      attachments,
      notes,
      tone,
      language,
      productContext,
    },
    null,
    2,
  );

  return `
あなたは優秀なB2B営業の専門ライターです。以下の情報をもとに、**そのまま送信できるクオリティの具体的で自然な営業メール**を作成してください。

## 重要な制約
- **「◯◯◯」などのプレースホルダーは一切使用しない**
- **添付資料がある場合のみ**、入力で与えられた '{{PDF_LINK_1}}' のような差し込みキーをそのまま本文へ記載してよい。**添付資料セクションが存在しない場合は、資料に関する記述を一切含めない**
- **抽象的な表現を避け、相手企業の情報を具体的に盛り込む**
- **クローリング結果を必ず活用し、相手企業に合わせた内容にする**
- 送信者（Sender）と受信者（Recipient）の情報を絶対に混同しない
- 入力JSON内で "${MISSING_FIELD_PLACEHOLDER}" が指定されている項目は「情報未取得」を意味します。この文字列を本文へ記載せず、自然な言い換えや丁寧な補足で不足情報を伝えてください

---

## 送信者情報（私たちの会社）
- 会社名: ${sender.companyName}
- 担当者名: ${sender.fullName}
${sender.department ? `- 部署: ${sender.department}` : ""}
${sender.title ? `- 役職: ${sender.title}` : ""}
- メールアドレス: ${sender.email}
${sender.phone ? `- 電話番号: ${sender.phone}` : ""}
${sender.postalCode || sender.prefecture || sender.city || sender.address ? `- 住所: ${[sender.postalCode ? `〒${sender.postalCode}` : "", sender.prefecture || "", sender.city || "", sender.address || "", sender.building || ""].filter(Boolean).join(" ")}` : ""}
- 件名案: ${sender.subject}

## 受信者情報（相手企業）
${recipient.companyName ? `- 企業名: ${recipient.companyName}` : ""}
${recipient.contactName ? `- 担当者名: ${recipient.contactName}` : ""}
${recipient.department ? `- 部署: ${recipient.department}` : ""}
${recipient.title ? `- 役職: ${recipient.title}` : ""}
- 敬称: ${recipientGreeting}
- 対象URL: ${homepageUrl}

---

## 相手企業の詳細情報（クローリング結果）
${siteSummary}

**重要**: この情報から相手企業の**具体的な事業内容やサービス名**を読み取り、本文で自然に言及してください。
URLや項目名（【】で囲まれた見出し）をそのまま本文に書かないこと。
${attachmentSection}${notesSection}${productContextSection}
---

## 作成指示

### 1. 件名
- 簡潔で開封したくなる件名にする
- 具体的な提案内容を含める（不要な装飾や括弧は使わない）
- 例: 「${sampleSubject}」

### 2. 本文構成
**第1セクション: 挨拶と導入**
- ${recipientGreeting}への呼びかけで開始
- 「貴社のWebサイトを拝見し」など、サイト閲覧をきっかけにした旨を伝える
- クローリング結果から読み取った**具体的なサービス名や事業内容**を自然な文章で言及
  例: 「フリマアプリ『メルカリ』を展開されている点」「AI技術を活用した業務効率化ソリューション」など
- **絶対にURLや見出し（【】）を本文に書かない**

**第2セクション: 自己紹介と提案背景**
- 簡潔な挨拶（「お世話になっております」「突然のご連絡となり誠に恐れ入ります」など）
- ${sender.companyName}の${sender.fullName}であることを明記
- なぜ今回連絡したのか（ご相談したい内容、提案背景）を簡潔に述べる

**第3セクション: ご相談概要・提案内容（視覚的に区切る）**
- **「━━━━━━━━━━━━━━━」という太い罫線で視覚的に区切り開始**（強調したい重要セクション）
- **「■ご相談概要」という見出しの後、必ず1〜2行の説明文を入れる**（自社の事業内容や提案背景）
- **「■特徴」や「■導入メリット」などの見出しの後、箇条書き（3〜5項目）で具体的に説明**
  - 見出しだけを連続させない（■の後には必ず説明または箇条書きを入れる）
  - 導入事例、数値、具体的な効果などを含める
  - 各項目は簡潔に（1行20〜40文字程度）
${
  attachments.length > 0
    ? `- **添付資料があるため、「■資料」の見出し後にURL（${attachments.map((a) => a.url).join(", ")}）を記載**
  - **入力で与えたURL文字列は改変しない**（'{{PDF_LINK_1}}' のような差し込みキーもそのまま記載）
  - 例: 「■資料\\n詳細資料: {{PDF_LINK_1}}」`
    : `- **添付資料がないため、「■資料」セクションは絶対に含めない**
  - 資料に関する言及（「詳細資料」「{{PDF_LINK_1}}」など）を一切記載しない`
}
- **「━━━━━━━━━━━━━━━」という太い罫線で区切りを閉じる**

**第4セクション: 行動喚起（CTA）**
- 「少しでもご興味がございましたら」などの柔らかい導入
- オンライン打ち合わせやデモの提案（**具体的な時間（「15分程度」「平日10:00〜17:00」など）は記載しない**）
${sender.meetingUrl ? `- **商談日程URL（${sender.meetingUrl}）が提供されている場合、以下のように記載する：**\n  「よろしければ、以下より\n  お打合せをご希望の日時をお選びいただけますと幸甚です。\n  ${sender.meetingUrl}」` : `- **商談日程URLがない場合、日時候補の記載は不要**（「ご都合のよい日時をお知らせください」などシンプルに記載）`}

**第5セクション: 締めの挨拶と署名**
- 丁寧な締めの言葉で締めくくる
- 「以上、お手数ですが、ご確認のほどよろしくお願い申し上げます。」など
- **署名は細い罫線（===================）で囲む**（連絡先情報用）
  - 罫線内に会社名、部署、役職、担当者名、住所、電話番号、メールアドレスなどを記載
  - **住所は与えられた情報のみを正確に記載し、「（詳細は〜）」「（ビル名は〜）」などの補足説明を一切加えない**

### 3. スタイル要件
- **${langLabel}**、**${toneLabel}**なトーンで記述
- **視覚的な見やすさを最優先**：段落間に空行を入れ、読みやすくする
- **罫線を使い分けて視覚的な階層を作る**：
  - **太い罫線（━━━━━━━━━━━━━━━）**: 重要な提案内容セクション（ご相談概要、特徴など）を囲む
  - **細い罫線（===================）**: 署名・連絡先情報を囲む
- **箇条書きを効果的に使う**：特徴やメリットは箇条書きで（・や■を使用）
- 一文は長すぎず、簡潔に（1文30〜50文字程度を目安）
- 全体で600〜1000文字程度
- **プレーンテキストでも見やすいレイアウト**を意識

### 4. 絶対に守るべきルール
✅ クローリング結果から**サービス名や事業内容を読み取り**、自然な文章で組み込む
✅ 「◯◯◯」「例: 〜」などのプレースホルダーは使用禁止
✅ **添付資料が存在する場合のみ**、与えられた '{{PDF_LINK_n}}' を改変せず本文へ記載してよい。**添付資料がない場合は '{{PDF_LINK_n}}' や「■資料」セクションを絶対に含めない**
✅ **URLや見出し（【】）を本文にそのまま書かない**（相手企業のURLは不要、添付PDFのURLのみ記載可）
✅ 抽象的な表現（「貴社の課題を解決」など）だけでなく、具体的な言及をする
✅ 送信者と受信者の情報を混同しない
✅ そのまま送信できる完成度にする
✅ **具体的な時間（「15分程度」「平日10:00〜17:00」など）は記載しない**（会社によって異なるため）
✅ **「（詳細は別途ご案内）」「（詳細はお問い合わせください）」「（ビル名は別途ご案内します）」「（建物名は割愛しております）」などの省略表現・補足説明は絶対に使用禁止**（送信者情報は与えられた情報のみを正確に記載し、余計な説明を一切加えない）

**NG例**:
- 「企業URL: https://... という点に興味を持ちました」
- 「【企業の特徴・事業内容】に共感しました」
- 「15分程度のオンライン打ち合わせ」
- 「平日10:00〜17:00で調整可能です」
- 「住所: 東京都（詳細は別途ご案内）」「住所: 東京都（詳細はお問い合わせください）」
- 「住所: 〒100-0001 東京都千代田区千代田1-1（ビル名は別途ご案内します）」
- 「住所: 〒100-0001 東京都千代田区千代田1-1（建物名は割愛しております）」
- 添付資料がないのに「■資料」セクションを含める
- 添付資料がないのに「詳細資料: {{PDF_LINK_1}}」を記載する
- 見出しが連続する（中身がない）

**OK例**:
- 「フリマアプリ『メルカリ』を中心としたCtoCコマース事業に大変興味を持ちました」
- 「AI技術を活用した業務効率化ソリューションを展開されている点に共感いたしました」
- 「オンライン打ち合わせでご説明させていただきたく存じます」
- 「ご都合のよい日時をお知らせください」
- 「住所: 〒100-0001 東京都千代田区千代田1-1」（建物名がない場合はそのまま記載、余計な説明を加えない）
- 「住所: 〒100-0001 東京都千代田区千代田1-1 千代田ビル5F」（建物名がある場合はそのまま記載）
- 見出しの後に必ず説明文または箇条書きを記載する

---

## 出力フォーマット

件名: <具体的なメール件名>

本文:
<セクション形式の営業メール本文>

---

## 入力データ (JSON)
\`\`\`json
${structuredInput}
\`\`\`

以上の指示に従い、**即送信可能な高品質の営業メール**を作成してください。
`.trim();
}
