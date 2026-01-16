import { NextRequest } from "next/server";
import OpenAI from "openai";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses";
import { SYSTEM_KNOWLEDGE } from "@/lib/chatbotKnowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RAW_OPENAI_API_URL = process.env.OPENAI_API_URL;
const DEFAULT_MODEL = process.env.OPENAI_SALES_MODEL ?? "gpt-5-mini";

// GPT-5シリーズはtemperatureをサポートしない
const REASONING_SUPPORTED_MODELS = new Set([
  "gpt-5-mini",
  "gpt-5",
  "gpt-5-nano",
]);

const OPENAI_BASE_URL = RAW_OPENAI_API_URL
  ? RAW_OPENAI_API_URL.replace(/\/responses$/, "")
  : undefined;

let cachedClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY が未設定です。");
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL,
    });
  }
  return cachedClient;
}

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type RequestBody = {
  messages: ChatMessage[];
};

const SYSTEM_PROMPT = `あなたは営業支援AIアシスタントです。以下の役割を担います：

## あなたの役割
1. **システムの使い方サポート**: このシステム（AI営業フォーム自動送信システム）の使い方を分かりやすく説明します
2. **問い合わせ文言のアドバイス**: より効果的な問い合わせ文言を作成するためのアドバイスを提供します
3. **プロンプト作成支援**: ユーザーがより良い結果を得られるよう、入力内容のコツを教えます

## 重要な注意事項
- このシステムは「メール送信」ではなく「フォーム送信」システムです
- 企業の問い合わせフォームに自動で文言を送信する機能です
- 「メール」という言葉は使わず、「問い合わせ文言」「フォーム送信」と表現してください

## 回答のガイドライン
- 簡潔かつ親しみやすいトーンで回答
- 具体的なアドバイスと例を提示
- ユーザーの質問に的確に答える
- 必要に応じてステップバイステップで説明
- 以下の「システム知識ベース」の情報を活用して正確に回答する

日本語で回答してください。

---

# システム知識ベース
${SYSTEM_KNOWLEDGE}`;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("メッセージが必要です。", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const client = getOpenAIClient();

    // 会話履歴をプロンプトテキストに変換
    const conversationText = messages
      .map(
        (m) =>
          `${m.role === "user" ? "ユーザー" : "アシスタント"}: ${m.content}`,
      )
      .join("\n\n");

    const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${conversationText}\n\nアシスタント:`;

    // GPT-5シリーズ用のペイロード構築
    const isReasoningModel = REASONING_SUPPORTED_MODELS.has(DEFAULT_MODEL);
    const payload: ResponseCreateParamsStreaming = {
      model: DEFAULT_MODEL,
      input: fullPrompt,
      max_output_tokens: 1500,
      stream: true,
      // GPT-5シリーズはtemperatureをサポートしない
      ...(isReasoningModel
        ? {
            reasoning: { effort: "low" },
            text: { format: { type: "text" } },
          }
        : { temperature: 0.7 }),
    };

    type ChatbotStreamEvent = {
      type?: string;
      delta?: unknown;
      output_text?: unknown;
    };

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const stream = (await client.responses.create(
            payload,
          )) as unknown as AsyncIterable<ChatbotStreamEvent>;

          for await (const event of stream) {
            // responses streaming delivers delta chunks
            if (event?.type === "response.output_text.delta" && event?.delta) {
              controller.enqueue(encoder.encode(String(event.delta)));
            } else if (typeof event?.output_text === "string") {
              controller.enqueue(encoder.encode(event.output_text));
            }
          }

          controller.close();
        } catch (err) {
          console.error("[ChatbotAPI] OpenAI error:", err);
          controller.enqueue(
            encoder.encode(
              "申し訳ございません。エラーが発生しました。しばらくしてから再度お試しください。",
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました。";
    return new Response(message, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
