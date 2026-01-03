import { NextRequest, NextResponse } from "next/server";

import { requireBackofficeAuth } from "@/lib/backofficeAuth";
import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import { findAuthUserIdByEmail } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

type UpdateAccountBody = {
  name?: string;
  role?: "admin" | "member";
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const denied = await requireBackofficeAuth(request);
  if (denied) return denied;

  try {
    const { accountId } = await context.params;
    const id = String(accountId ?? "").trim();
    if (!id)
      return NextResponse.json(
        { error: "accountId が不正です" },
        { status: 400 },
      );

    const body = (await request.json().catch(() => ({}))) as UpdateAccountBody;
    const supabase = createSupabaseServiceClient();

    const { data: existing, error: existingErr } = await supabase
      .from("accounts")
      .select("id, company_id, email, name, role, status")
      .eq("id", id)
      .maybeSingle();

    if (existingErr) {
      console.error("[backoffice/accounts] select failed", existingErr);
      return NextResponse.json(
        { error: "更新に失敗しました" },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json(
        { error: "アカウントが見つかりません" },
        { status: 404 },
      );
    }

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.name !== undefined)
      payload.name = String(body.name).trim() || null;
    if (body.role !== undefined) payload.role = body.role;

    const { data: updated, error: updateErr } = await supabase
      .from("accounts")
      .update(payload)
      .eq("id", id)
      .select(
        "id, company_id, email, name, role, status, invited_at, activated_at, created_at, updated_at",
      )
      .maybeSingle();

    if (updateErr) {
      console.error("[backoffice/accounts] update failed", updateErr);
      return NextResponse.json(
        { error: "更新に失敗しました" },
        { status: 500 },
      );
    }

    // role 更新は Auth metadata も更新（best-effort）
    if (body.role && body.role !== existing.role) {
      try {
        const userId = await findAuthUserIdByEmail(supabase, existing.email);
        if (userId) {
          await supabase.auth.admin.updateUserById(userId, {
            user_metadata: {
              company_id: existing.company_id,
              role: body.role,
            },
          });
        }
      } catch (e) {
        console.warn("[backoffice/accounts] update auth metadata failed", e);
      }
    }

    return NextResponse.json({ success: true, account: updated ?? null });
  } catch (err) {
    console.error("[backoffice/accounts] Unexpected error", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const denied = await requireBackofficeAuth(request);
  if (denied) return denied;

  try {
    const { accountId } = await context.params;
    const id = String(accountId ?? "").trim();
    if (!id)
      return NextResponse.json(
        { error: "accountId が不正です" },
        { status: 400 },
      );

    const supabase = createSupabaseServiceClient();
    const { data: existing, error: existingErr } = await supabase
      .from("accounts")
      .select("id, email")
      .eq("id", id)
      .maybeSingle();

    if (existingErr) {
      console.error("[backoffice/accounts] select failed", existingErr);
      return NextResponse.json(
        { error: "削除に失敗しました" },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json(
        { error: "アカウントが見つかりません" },
        { status: 404 },
      );
    }

    // Authユーザー削除（best-effort）
    try {
      const userId = await findAuthUserIdByEmail(supabase, existing.email);
      if (userId) await supabase.auth.admin.deleteUser(userId);
    } catch (e) {
      console.warn("[backoffice/accounts] delete auth user failed", e);
    }

    const { error: delErr } = await supabase
      .from("accounts")
      .delete()
      .eq("id", id);
    if (delErr) {
      console.error("[backoffice/accounts] delete failed", delErr);
      return NextResponse.json(
        { error: "削除に失敗しました" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[backoffice/accounts] Unexpected error", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
