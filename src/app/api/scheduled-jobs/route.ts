import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedCompanyId } from "@/lib/routeAuth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// 予約ジョブ一覧を取得
export async function GET(request: NextRequest) {
  try {
    const companyId = await getAuthenticatedCompanyId(request);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("scheduled_jobs")
      .select("*")
      .eq("company_id", companyId)
      .order("scheduled_at", { ascending: true });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[scheduled-jobs] Failed to fetch:", error);
      return NextResponse.json(
        { error: "Failed to fetch scheduled jobs" },
        { status: 500 },
      );
    }

    return NextResponse.json({ jobs: data });
  } catch (error) {
    console.error("[scheduled-jobs] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// 予約ジョブを作成
export async function POST(request: NextRequest) {
  try {
    const companyId = await getAuthenticatedCompanyId(request);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      schedule_type = "once",
      scheduled_at,
      hour = 9,
      minute = 0,
      day_of_week,
      day_of_month,
      timezone = "Asia/Tokyo",
      lead_ids,
      filter_conditions,
      send_config,
    } = body;

    // バリデーション
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!scheduled_at) {
      return NextResponse.json(
        { error: "Scheduled time is required" },
        { status: 400 },
      );
    }

    if (!send_config) {
      return NextResponse.json(
        { error: "Send config is required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("scheduled_jobs")
      .insert({
        company_id: companyId,
        name,
        schedule_type,
        scheduled_at,
        hour,
        minute,
        day_of_week,
        day_of_month,
        timezone,
        lead_ids: lead_ids || [],
        filter_conditions,
        send_config,
      })
      .select()
      .single();

    if (error) {
      console.error("[scheduled-jobs] Failed to create:", error);
      return NextResponse.json(
        { error: "Failed to create scheduled job" },
        { status: 500 },
      );
    }

    return NextResponse.json({ job: data }, { status: 201 });
  } catch (error) {
    console.error("[scheduled-jobs] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
