import { NextResponse } from "next/server";
import { getNextAction } from "@/lib/dashboard";
import { createDashboardSupabaseClient } from "@/lib/dashboardSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_DEV = process.env.NODE_ENV !== "production";

export async function GET() {
  try {
    const supabase = createDashboardSupabaseClient();
    const { data, error } = await supabase
      .from("outage_jobs")
      .select(
        [
          "id",
          "doc_status",
          "doc_generated_at",
          "document_received_at",
          "document_received_by",
          "document_delivered_at",
          "document_delivered_by",
          "document_delivery_note",
          "social_status",
          "social_posted_at",
          "notice_status",
          "notice_date",
          "nakhon_status",
          "nakhon_notified_date",
          "is_closed"
        ].join(",")
      );

    if (error) throw error;

    const jobs = (Array.isArray(data) ? data : []) as Array<Record<string, any>>;

    const openCount = jobs.filter((job) => !job?.is_closed).length;
    const closedCount = jobs.filter((job) => !!job?.is_closed).length;

    const actionRequiredCount = jobs.filter((job) => {
      if (job?.is_closed) return false;
      const nextAction = getNextAction(job as any);
      return nextAction !== "ครบแล้ว" && nextAction !== "ปิดงาน";
    }).length;


    return NextResponse.json({
      ok: true,
      openCount,
      closedCount,
      actionRequiredCount
    });
  } catch (error) {
    console.error("Dashboard summary failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error)
    });
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
