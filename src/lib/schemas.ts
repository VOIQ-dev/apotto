/**
 * Zodを使用した入力バリデーションスキーマ
 *
 * すべてのAPIエンドポイントで使用する共通のバリデーションスキーマを定義
 */

import { z } from "zod";

/**
 * メールアドレスのバリデーション
 */
export const emailSchema = z
  .string()
  .email("有効なメールアドレスを入力してください")
  .max(255, "メールアドレスは255文字以下にしてください");

/**
 * URLのバリデーション
 */
export const urlSchema = z.string().url("有効なURLを入力してください");

/**
 * 電話番号のバリデーション（日本の形式）
 */
export const phoneSchema = z
  .string()
  .regex(
    /^[\d-+() ]+$/,
    "電話番号には数字、ハイフン、括弧、プラス記号のみ使用できます",
  )
  .min(10, "電話番号は10文字以上にしてください")
  .max(20, "電話番号は20文字以下にしてください");

/**
 * 問い合わせフォーム（ダウンロード）
 */
export const ContactDownloadFormSchema = z.object({
  formType: z.literal("download"),
  lastName: z
    .string()
    .min(1, "姓を入力してください")
    .max(50, "姓は50文字以下にしてください"),
  firstName: z
    .string()
    .min(1, "名を入力してください")
    .max(50, "名は50文字以下にしてください"),
  companyName: z
    .string()
    .min(1, "会社名を入力してください")
    .max(200, "会社名は200文字以下にしてください"),
  department: z.string().max(100, "部署名は100文字以下にしてください"),
  position: z.string().max(100, "役職名は100文字以下にしてください"),
  email: emailSchema,
  phone: phoneSchema,
  howDidYouHear: z
    .string()
    .min(1, "認知経路を選択してください")
    .max(100, "認知経路は100文字以下にしてください"),
  howDidYouHearOther: z
    .string()
    .max(200, "その他の内容は200文字以下にしてください")
    .optional(),
});

/**
 * 問い合わせフォーム（デモ申し込み）
 */
export const ContactDemoFormSchema = z.object({
  formType: z.literal("demo"),
  lastName: z
    .string()
    .min(1, "姓を入力してください")
    .max(50, "姓は50文字以下にしてください"),
  firstName: z
    .string()
    .min(1, "名を入力してください")
    .max(50, "名は50文字以下にしてください"),
  companyName: z
    .string()
    .min(1, "会社名を入力してください")
    .max(200, "会社名は200文字以下にしてください"),
  department: z.string().max(100, "部署名は100文字以下にしてください"),
  position: z.string().max(100, "役職名は100文字以下にしてください"),
  email: emailSchema,
  phone: phoneSchema,
  employeeCount: z
    .string()
    .min(1, "従業員規模を選択してください")
    .max(50, "従業員規模は50文字以下にしてください"),
  serviceUrl: urlSchema,
  averageOrderValue: z
    .string()
    .min(1, "受注平均単価を入力してください")
    .max(50, "受注平均単価は50文字以下にしてください"),
  howDidYouHear: z
    .string()
    .min(1, "認知経路を選択してください")
    .max(100, "認知経路は100文字以下にしてください"),
  howDidYouHearOther: z
    .string()
    .max(200, "その他の内容は200文字以下にしてください")
    .optional(),
  expectedStartDate: z
    .string()
    .min(1, "利用開始想定時期を選択してください")
    .max(50, "利用開始想定時期は50文字以下にしてください"),
  content: z.string().max(2000, "お問い合わせ背景は2000文字以下にしてください"),
});

/**
 * 問い合わせフォーム（両方のパターンを受け入れる）
 */
export const ContactFormSchema = z.discriminatedUnion("formType", [
  ContactDownloadFormSchema,
  ContactDemoFormSchema,
]);

/**
 * 型エクスポート
 */
export type ContactFormData = z.infer<typeof ContactFormSchema>;
export type ContactDownloadFormData = z.infer<typeof ContactDownloadFormSchema>;
export type ContactDemoFormData = z.infer<typeof ContactDemoFormSchema>;

/**
 * リードデータ
 */
export const LeadSchema = z.object({
  companyName: z
    .string()
    .min(1, "会社名を入力してください")
    .max(200, "会社名は200文字以下にしてください"),
  homepageUrl: urlSchema,
  contactName: z
    .string()
    .max(100, "担当者名は100文字以下にしてください")
    .optional(),
  department: z
    .string()
    .max(100, "部署名は100文字以下にしてください")
    .optional(),
  title: z.string().max(100, "役職名は100文字以下にしてください").optional(),
  email: emailSchema.optional(),
});

/**
 * リードのインポート
 */
export const LeadImportSchema = z.object({
  leads: z
    .array(LeadSchema)
    .min(1, "少なくとも1件のリードが必要です")
    .max(1000, "一度にインポートできるリードは1000件までです"),
  fileName: z.string().max(255).optional(),
});

/**
 * 自動送信リクエスト
 */
export const AutoSubmitSchema = z.object({
  url: z.string().min(1, "URLは必須です"),
  company: z.string().max(200).optional(),
  person: z.string().max(100).optional(),
  name: z.string().max(100).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  subject: z.string().max(200).optional(),
  message: z.string().max(5000).optional(),
  debug: z.boolean().optional(),
});

/**
 * ログインリクエスト
 */
export const LoginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, "パスワードは8文字以上にしてください")
    .max(100, "パスワードは100文字以下にしてください"),
});

/**
 * Backofficeログインリクエスト
 */
export const BackofficeLoginSchema = z.object({
  username: z
    .string()
    .min(1, "ユーザー名を入力してください")
    .max(50, "ユーザー名は50文字以下にしてください"),
  password: z
    .string()
    .min(8, "パスワードは8文字以上にしてください")
    .max(100, "パスワードは100文字以下にしてください"),
});

/**
 * アカウント作成リクエスト
 */
export const CreateAccountSchema = z.object({
  email: emailSchema,
  name: z.string().max(100, "名前は100文字以下にしてください").optional(),
  role: z.enum(["admin", "member"], {
    message: "roleは'admin'または'member'である必要があります",
  }),
});

/**
 * 会社作成リクエスト
 */
export const CreateCompanySchema = z.object({
  name: z
    .string()
    .min(1, "会社名を入力してください")
    .max(200, "会社名は200文字以下にしてください"),
  domain: z.string().max(255, "ドメインは255文字以下にしてください").optional(),
});

/**
 * 会社更新リクエスト
 */
export const UpdateCompanySchema = z.object({
  name: z.string().max(200, "会社名は200文字以下にしてください").optional(),
  domain: z.string().max(255, "ドメインは255文字以下にしてください").optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
});

/**
 * アカウント更新リクエスト
 */
export const UpdateAccountSchema = z.object({
  name: z.string().max(100, "名前は100文字以下にしてください").optional(),
  role: z.enum(["admin", "member"]).optional(),
});

/**
 * パスワードリセットリクエスト
 */
export const ResetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "パスワードは8文字以上にしてください")
    .max(100, "パスワードは100文字以下にしてください")
    .optional(),
});

/**
 * バリデーションヘルパー関数
 */
export function validateRequest<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: result.error };
  }
}

/**
 * Zodエラーをユーザーフレンドリーなメッセージに変換
 */
export function formatZodErrors(error: z.ZodError<unknown>): {
  message: string;
  fields: Record<string, string>;
} {
  const fields: Record<string, string> = {};

  error.issues.forEach((err) => {
    const path = err.path.join(".");
    fields[path] = err.message;
  });

  return {
    message: "入力内容にエラーがあります",
    fields,
  };
}
