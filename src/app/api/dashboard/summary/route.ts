import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PENDING_APPROVAL_STATUSES = ["PENDING", "WAITING_APPROVAL"];
const SCHEDULED_NOTICE_STATUS = "SCHEDULED";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const IS_DEV = process.env.NODE_ENV !== "production";

type QueryTarget = {
  table: string;
  columns: string[];
  filters?: Record<string, string | string[]>;
};

function createSupabaseServerClient() {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function logQueryError(target: QueryTarget, message: string) {
  console.error("Dashboard summary query failed", {
    message,
    target
  });
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const [
      activeJobsClosedResult,
      activeJobsNullResult,
      pendingApprovalResult,
      scheduledNoticeStatusResult,
      scheduledNoticeDateFallbackResult
    ] = await Promise.all([
      supabase
        .from("outage_jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_closed", false),
      supabase
        .from("outage_jobs")
        .select("id", { count: "exact", head: true })
        .is("is_closed", null),
      supabase
        .from("outage_jobs")
        .select("id", { count: "exact", head: true })
        .in("social_status", PENDING_APPROVAL_STATUSES),
      supabase
        .from("outage_jobs")
        .select("id", { count: "exact", head: true })
        .eq("notice_status", SCHEDULED_NOTICE_STATUS),
      supabase
        .from("outage_jobs")
        .select("id", { count: "exact", head: true })
        .is("notice_status", null)
        .not("notice_date", "is", null)
    ]);

    if (activeJobsClosedResult.error) {
      logQueryError(
        {
          table: "outage_jobs",
          columns: ["id"],
          filters: { is_closed: "false" }
        },
        activeJobsClosedResult.error.message
      );
      throw new Error(activeJobsClosedResult.error.message);
    }
    if (activeJobsNullResult.error) {
      logQueryError(
        {
          table: "outage_jobs",
          columns: ["id"],
          filters: { is_closed: "null" }
        },
        activeJobsNullResult.error.message
      );
      throw new Error(activeJobsNullResult.error.message);
    }
    if (pendingApprovalResult.error) {
      logQueryError(
        {
          table: "outage_jobs",
          columns: ["id"],
          filters: { social_status: PENDING_APPROVAL_STATUSES }
        },
        pendingApprovalResult.error.message
      );
      throw new Error(pendingApprovalResult.error.message);
    }
    if (scheduledNoticeStatusResult.error) {
      logQueryError(
        {
          table: "outage_jobs",
          columns: ["id"],
          filters: { notice_status: SCHEDULED_NOTICE_STATUS }
        },
        scheduledNoticeStatusResult.error.message
      );
      throw new Error(scheduledNoticeStatusResult.error.message);
    }
    if (scheduledNoticeDateFallbackResult.error) {
      logQueryError(
        {
          table: "outage_jobs",
          columns: ["id"],
          filters: { notice_status: "null", notice_date: "is not null" }
        },
        scheduledNoticeDateFallbackResult.error.message
      );
      throw new Error(scheduledNoticeDateFallbackResult.error.message);
    }

    const activeJobs =
      (activeJobsClosedResult.count ?? 0) +
      (activeJobsNullResult.count ?? 0);
    const pendingApproval = pendingApprovalResult.count ?? 0;
    const scheduledNotices =
      (scheduledNoticeStatusResult.count ?? 0) +
      (scheduledNoticeDateFallbackResult.count ?? 0);

    if (IS_DEV) {
      console.debug("Dashboard summary counts", {
        activeJobs,
        pendingApproval,
        scheduledNotices
      });
    }

    return NextResponse.json({
      ok: true,
      activeJobs,
      pendingApproval,
      scheduledNotices
    });
  } catch (error) {
    console.error("Dashboard summary failed", error);
    const message =
      error instanceof Error ? error.message : "Unexpected error";
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
