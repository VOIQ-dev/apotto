import { NextRequest, NextResponse } from "next/server";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.cwd(), "server");
const LOG_FILE = join(LOG_DIR, "submission-results.log");

export type FailureCategory =
  | "FORM_NOT_FOUND"
  | "BUTTON_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CAPTCHA_BLOCKED"
  | "CAPTCHA_SPAM"
  | "ALERT_BLOCKED"
  | "DISABLED_BUTTON"
  | "SUCCESS_UNCONFIRMED"
  | "TIMEOUT"
  | "CONTENT_SCRIPT_ERROR"
  | "UNKNOWN";

interface SubmissionLogEntry {
  timestamp: string;
  status: "success" | "failed";
  company: string;
  targetUrl: string;
  formUrl?: string;
  finalUrl?: string;
  failureCategory?: FailureCategory;
  errorDetail?: string;
  formScore?: number;
  formReasons?: string[];
  buttonTexts?: string[];
  captchaInfo?: string;
  validationInfo?: {
    phase: string;
    errors: { field: string; message: string }[];
  }[];
  debugLogs?: string[];
  batchId?: string;
}

function formatLogEntry(entry: SubmissionLogEntry): string {
  const statusIcon = entry.status === "success" ? "✅ 成功" : "❌ 失敗";
  const lines: string[] = [];

  lines.push(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  lines.push(`[${entry.timestamp}] 送信結果: ${statusIcon}`);
  lines.push(`  会社名: ${entry.company}`);
  lines.push(`  対象URL: ${entry.targetUrl}`);
  if (entry.formUrl) lines.push(`  フォームURL: ${entry.formUrl}`);
  if (entry.finalUrl) lines.push(`  最終URL: ${entry.finalUrl}`);
  if (entry.failureCategory)
    lines.push(`  失敗カテゴリ: ${entry.failureCategory}`);
  if (entry.errorDetail) lines.push(`  エラー詳細: ${entry.errorDetail}`);
  if (entry.formScore != null) {
    lines.push(
      `  フォーム検出: score=${entry.formScore}, reasons=[${(entry.formReasons || []).join(", ")}]`,
    );
  }
  if (entry.buttonTexts && entry.buttonTexts.length > 0) {
    lines.push(`  ボタン情報: [${entry.buttonTexts.join(", ")}]`);
  }
  if (entry.captchaInfo) lines.push(`  CAPTCHA: ${entry.captchaInfo}`);
  if (entry.validationInfo && entry.validationInfo.length > 0) {
    lines.push(`  バリデーション情報:`);
    for (const phase of entry.validationInfo) {
      lines.push(`    [${phase.phase}] ${phase.errors.length}件のエラー:`);
      for (const err of phase.errors) {
        lines.push(`      - フィールド: ${err.field} → "${err.message}"`);
      }
    }
  }
  if (entry.debugLogs && entry.debugLogs.length > 0) {
    lines.push(`  デバッグログ:`);
    const recentLogs = entry.debugLogs.slice(-20);
    for (const logLine of recentLogs) {
      lines.push(`    ${logLine}`);
    }
  }

  return lines.join("\n") + "\n";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!LOG_DIR || !existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }

    if (body.type === "entry") {
      const entry = body.data as SubmissionLogEntry;
      const formatted = formatLogEntry(entry);
      appendFileSync(LOG_FILE, formatted, "utf-8");

      return NextResponse.json({ success: true });
    }

    if (body.type === "summary") {
      const { total, success, failed, categories, batchId } = body.data as {
        total: number;
        success: number;
        failed: number;
        categories: Record<string, number>;
        batchId?: string;
      };

      const successRate =
        total > 0 ? ((success / total) * 100).toFixed(1) : "0.0";
      const failedRate =
        total > 0 ? ((failed / total) * 100).toFixed(1) : "0.0";

      const lines: string[] = [];
      lines.push(
        "\n================================================================================",
      );
      lines.push(`📊 送信結果サマリー${batchId ? ` (batch: ${batchId})` : ""}`);
      lines.push(`  日時: ${new Date().toISOString()}`);
      lines.push(`  総数: ${total}件`);
      lines.push(`  成功: ${success}件 (${successRate}%)`);
      lines.push(`  失敗: ${failed}件 (${failedRate}%)`);

      if (Object.keys(categories).length > 0) {
        lines.push("");
        lines.push("  失敗内訳:");
        const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
        for (const [cat, count] of sorted) {
          const pct = failed > 0 ? ((count / failed) * 100).toFixed(1) : "0.0";
          lines.push(
            `    ${cat.padEnd(25)} ${String(count).padStart(3)}件 (${pct}%)`,
          );
        }
      }

      lines.push(
        "================================================================================\n",
      );

      appendFileSync(LOG_FILE, lines.join("\n"), "utf-8");
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "Invalid type" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[submission-log] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}
