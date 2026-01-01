import { isSesEnabled } from "./featureFlags";

type SendEmailInput = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  templateId?: string;
  context?: Record<string, unknown>;
};

type SendEmailResult = {
  enabled: boolean;
  messageId: string;
  status: "sent" | "stubbed";
};

/**
 * SES未設定時はスタブとしてログ出力のみ行う。
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (!isSesEnabled()) {
    console.info("[SES:stub]", {
      to: input.to,
      subject: input.subject,
      templateId: input.templateId,
      context: input.context,
    });
    return { enabled: false, messageId: "stub-message-id", status: "stubbed" };
  }

  // TODO: AWS SDK v3 (SES) で実装する
  throw new Error("SES is enabled but not yet implemented");
}
