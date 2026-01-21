import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createSupabaseServerClient() {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const [activeJobsResult, pendingApprovalResult, scheduledNoticesResult] =
      await Promise.all([
        // `status != done` maps to `is_closed` in `outage_jobs`.
        supabase
          .from("outage_jobs")
          .select("id", { count: "exact", head: true })
          .or("is_closed.is.null,is_closed.eq.false"),
        // `status = pending` maps to `social_status = PENDING_APPROVAL`.
        supabase
          .from("outage_jobs")
          .select("id", { count: "exact", head: true })
          .eq("social_status", "PENDING_APPROVAL"),
        supabase
          .from("outage_jobs")
          .select("id", { count: "exact", head: true })
          .not("notice_date", "is", null)
      ]);

    if (activeJobsResult.error) {
      throw new Error(activeJobsResult.error.message);
    }
    if (pendingApprovalResult.error) {
      throw new Error(pendingApprovalResult.error.message);
    }
    if (scheduledNoticesResult.error) {
      throw new Error(scheduledNoticesResult.error.message);
    }

    return NextResponse.json({
      activeJobs: activeJobsResult.count ?? 0,
      pendingApproval: pendingApprovalResult.count ?? 0,
      scheduledNotices: scheduledNoticesResult.count ?? 0
    });
  } catch (error) {
    console.error("Dashboard summary failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
