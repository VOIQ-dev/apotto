import { NextRequest, NextResponse } from "next/server";
import {
  getAccountContextFromRequest,
  applyAuthCookies,
  createSessionInvalidResponse,
} from "@/lib/routeAuth";
import { ErrorMessages, createErrorResponse, logError } from "@/lib/errors";
import {
  checkRateLimit,
  RateLimitPresets,
  addRateLimitHeaders,
} from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

type FeedbackRequest = {
  feedbackType: "要望" | "問い合わせ" | "バグ報告";
  content: string;
};

function buildSlackMessage(
  data: FeedbackRequest,
  userEmail: string,
  userName?: string,
): object {
  const typeEmoji = {
    要望: "💡",
    問い合わせ: "❓",
    バグ報告: "🐛",
  }[data.feedbackType];

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${typeEmoji} ${data.feedbackType}`,
        emoji: true,
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*ユーザー*\n${userName || userEmail}`,
        },
        {
          type: "mrkdwn",
          text: `*メールアドレス*\n${userEmail}`,
        },
      ],
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*内容*\n${data.content}`,
      },
    },
    {
      type: "divider",
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `送信日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
        },
      ],
    },
  ];

  return {
    blocks,
    text: `${data.feedbackType} - ${userName || userEmail}`,
  };
}

export async function POST(req: NextRequest) {
  const { companyId, cookieMutations, sessionValid, account } =
    await getAccountContextFromRequest(req);

  // セッション無効チェック
  if (!sessionValid || !account) {
    console.error("[POST /api/feedback] Session invalid", {
      email: account?.email,
      companyId,
    });
    return createSessionInvalidResponse(cookieMutations);
  }

  // レート制限チェック
  const rateLimitResult = checkRateLimit(req, RateLimitPresets.contactForm);

  if (!rateLimitResult.allowed) {
    const response = NextResponse.json(
      createErrorResponse(ErrorMessages.RATE_LIMIT.EXCEEDED, {
        retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
      }),
      { status: 429 },
    );
    addRateLimitHeaders(response.headers, rateLimitResult);
    applyAuthCookies(response, cookieMutations);
    return response;
  }

  try {
    const body = (await req.json().catch(() => ({}))) as FeedbackRequest;

    if (!body.feedbackType || !body.content) {
      const res = NextResponse.json(
        { error: "種別と内容は必須です" },
        { status: 400 },
      );
      addRateLimitHeaders(res.headers, rateLimitResult);
      applyAuthCookies(res, cookieMutations);
      return res;
    }

    // Slackに通知
    if (SLACK_WEBHOOK_URL) {
      const slackMessage = buildSlackMessage(body, account.email, undefined);

      const slackResponse = await fetch(SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(slackMessage),
      });

      if (!slackResponse.ok) {
        const errorText = await slackResponse.text();
        logError("feedback", new Error("Slack notification failed"), {
          status: slackResponse.status,
          response: errorText,
        });
        // Slack通知が失敗してもユーザーにはエラーを返さない（ログのみ）
      }
    } else {
      console.warn("[POST /api/feedback] SLACK_WEBHOOK_URL is not configured");
    }

    const res = NextResponse.json({
      success: true,
      message: "フィードバックを送信しました",
    });
    addRateLimitHeaders(res.headers, rateLimitResult);
    applyAuthCookies(res, cookieMutations);
    return res;
  } catch (error) {
    logError("feedback", error, { companyId });
    const res = NextResponse.json(
      createErrorResponse(ErrorMessages.SERVER.SERVICE_UNAVAILABLE),
      { status: 500 },
    );
    applyAuthCookies(res, cookieMutations);
    return res;
  }
}
