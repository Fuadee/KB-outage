import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PENDING_APPROVAL_STATUSES = ["PENDING"];
const SCHEDULED_NOTICE_STATUSES = ["NOTICE_SCHEDULED", "NOTICE_SENT"];

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
    const currentDate = new Date().toISOString().slice(0, 10);

    const [
      activeJobsResult,
      pendingApprovalResult,
      noticeDateColumnResult
    ] = await Promise.all([
      supabase
        .from("outage_jobs")
        .select("id", { count: "exact", head: true })
        .gte("outage_date", currentDate),
      supabase
        .from("outage_jobs")
        .select("id", { count: "exact", head: true })
        .in("nakhon_status", PENDING_APPROVAL_STATUSES),
      supabase
        .from("information_schema.columns")
        .select("column_name", { count: "exact", head: true })
        .eq("table_schema", "public")
        .eq("table_name", "outage_jobs")
        .eq("column_name", "notice_date")
    ]);

    if (activeJobsResult.error) {
      logQueryError(
        {
          table: "outage_jobs",
          columns: ["id"],
          filters: { outage_date: `>= ${currentDate}` }
        },
        activeJobsResult.error.message
      );
      throw new Error(activeJobsResult.error.message);
    }
    if (pendingApprovalResult.error) {
      logQueryError(
        {
          table: "outage_jobs",
          columns: ["id"],
          filters: { nakhon_status: PENDING_APPROVAL_STATUSES }
        },
        pendingApprovalResult.error.message
      );
      throw new Error(pendingApprovalResult.error.message);
    }
    if (noticeDateColumnResult.error) {
      logQueryError(
        {
          table: "information_schema.columns",
          columns: ["column_name"],
          filters: {
            table_schema: "public",
            table_name: "outage_jobs",
            column_name: "notice_date"
          }
        },
        noticeDateColumnResult.error.message
      );
      throw new Error(noticeDateColumnResult.error.message);
    }

    let scheduledNotices = 0;
    if ((noticeDateColumnResult.count ?? 0) > 0) {
      const noticeDateResult = await supabase
        .from("outage_jobs")
        .select("id", { count: "exact", head: true })
        .not("notice_date", "is", null);

      if (noticeDateResult.error) {
        logQueryError(
          {
            table: "outage_jobs",
            columns: ["id"],
            filters: { notice_date: "is not null" }
          },
          noticeDateResult.error.message
        );
        throw new Error(noticeDateResult.error.message);
      }

      scheduledNotices = noticeDateResult.count ?? 0;
    } else {
      const noticeStatusResult = await supabase
        .from("outage_jobs")
        .select("id", { count: "exact", head: true })
        .in("nakhon_status", SCHEDULED_NOTICE_STATUSES);

      if (!noticeStatusResult.error) {
        scheduledNotices = noticeStatusResult.count ?? 0;
      }
    }

    if (IS_DEV) {
      console.debug("Dashboard summary counts", {
        currentDate,
        activeJobs: activeJobsResult.count ?? 0,
        pendingApproval: pendingApprovalResult.count ?? 0,
        scheduledNotices
      });
    }

    return NextResponse.json({
      activeJobs: activeJobsResult.count ?? 0,
      pendingApproval: pendingApprovalResult.count ?? 0,
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
