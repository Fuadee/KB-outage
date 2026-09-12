import { NextResponse } from "next/server";
import { getDashboardStep, getNextAction } from "@/lib/dashboard";
import { createDashboardSupabaseClient } from "@/lib/dashboardSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_DEV = process.env.NODE_ENV !== "production";

const VALID_FILTERS = ["all", "open", "closed"] as const;

type FilterValue = (typeof VALID_FILTERS)[number];

function getFilterValue(value: string | null): FilterValue {
  if (!value) return "all";
  return VALID_FILTERS.includes(value as FilterValue)
    ? (value as FilterValue)
    : "all";
}

function getLimitValue(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 200);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = getFilterValue(searchParams.get("filter"));
    const limit = getLimitValue(searchParams.get("limit"));

    const supabase = createDashboardSupabaseClient();
    let query = supabase
      .from("outage_jobs")
      .select(
        [
          "id",
          "outage_date",
          "equipment_code",
          "doc_status",
          "doc_generated_at",
          "doc_url",
          "document_received_at",
          "document_received_by",
          "document_delivered_at",
          "document_delivered_by",
          "document_delivery_note",
          "social_status",
          "social_posted_at",
          "social_approved_at",
          "notice_status",
          "notice_date",
          "notice_scheduled_at",
          "nakhon_status",
          "nakhon_notified_date",
          "is_closed",
          "closed_at",
          "created_at"
        ].join(",")
      )
      .order("outage_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filter === "closed") {
      query = query.eq("is_closed", true);
    }

    if (filter === "open") {
      query = query.or("is_closed.eq.false,is_closed.is.null");
    }

    const { data, error } = await query;

    if (error) throw error;

    const jobs = (data ?? []).map((job) => {
      const base =
        job && typeof job === "object"
          ? (job as Record<string, any>)
          : ({} as Record<string, any>);

      return {
        ...base,
        step: getDashboardStep(base as any),
        next_action: getNextAction(base as any)
      };
    });


    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    console.error("Dashboard jobs failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error)
    });
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      {
        ok: false,
        error: IS_DEV
          ? message
          : "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่"
      },
      { status: 500 }
    );
  }
}
