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

const SYSTEM_PROMPT = `あなたはapottoの営業支援AIアシスタントです。

## 役割
- システムの使い方サポート
- 効果的な問い合わせ文言のアドバイス

## 厳守ルール
- **画像の添付・共有・キャプチャの表示はできません。テキストのみで説明してください。**
- このシステムは「メール送信」ではなく「フォーム送信」です。「メール」ではなく「問い合わせ文言」「フォーム送信」と表現すること。
- 実装していない機能や、存在しない画面・ボタンについて言及しないこと。

## 回答スタイル
- 親しみやすく丁寧な口調で、頼れるサポート担当のように回答する。
- 端的にまとめつつも、冒頭に一言添えて自然な会話にする（例:「いい質問ですね！」「こちらですね。」）。
- 箇条書きやMarkdown書式（太字・リスト・見出し）を活用して見やすく整形する。
- 1回答あたり300文字以内を目安に、要点を絞って回答する。
- 毎回同じ定型の締め文（「他にご質問があれば〜」）は使わない。必要に応じて自然な一言で締める。

日本語で回答。

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
