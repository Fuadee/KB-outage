import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getDashboardStep, getNextAction } from "@/lib/dashboard";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const IS_DEV = process.env.NODE_ENV !== "production";

const VALID_FILTERS = ["all", "open", "closed"] as const;

type FilterValue = (typeof VALID_FILTERS)[number];

function createSupabaseServerClient() {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

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

    const supabase = createSupabaseServerClient();
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

      .order("created_at", { ascending: false })
      .limit(limit);

    if (filter === "closed") {
      query = query.eq("is_closed", true);
    }

    if (filter === "open") {
      query = query.or("is_closed.eq.false,is_closed.is.null");
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

  const jobs = (data ?? []).map((job) => {
  const base =
    job && typeof job === "object"
      ? (job as Record<string, any>)
      : ({} as Record<string, any>);

  return {
    ...base,
    step: getDashboardStep(base as any),
    next_action: getNextAction(base as any),
  };
});


    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    console.error("Dashboard jobs failed", error);
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
