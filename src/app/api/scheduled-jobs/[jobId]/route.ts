import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedCompanyId } from "@/lib/routeAuth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// 予約ジョブ詳細を取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const companyId = await getAuthenticatedCompanyId(request);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;

    const { data, error } = await supabase
      .from("scheduled_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("company_id", companyId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job: data });
  } catch (error) {
    console.error("[scheduled-jobs] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// 予約ジョブを更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const companyId = await getAuthenticatedCompanyId(request);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;
    const body = await request.json();

    // 更新可能なフィールドのみを抽出
    const allowedFields = [
      "name",
      "status",
      "schedule_type",
      "scheduled_at",
      "hour",
      "minute",
      "day_of_week",
      "day_of_month",
      "timezone",
      "lead_ids",
      "filter_conditions",
      "send_config",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("scheduled_jobs")
      .update(updateData)
      .eq("id", jobId)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) {
      console.error("[scheduled-jobs] Failed to update:", error);
      return NextResponse.json(
        { error: "Failed to update scheduled job" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job: data });
  } catch (error) {
    console.error("[scheduled-jobs] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// 予約ジョブを削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const companyId = await getAuthenticatedCompanyId(request);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;

    const { error } = await supabase
      .from("scheduled_jobs")
      .delete()
      .eq("id", jobId)
      .eq("company_id", companyId);

    if (error) {
      console.error("[scheduled-jobs] Failed to delete:", error);
      return NextResponse.json(
        { error: "Failed to delete scheduled job" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[scheduled-jobs] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
