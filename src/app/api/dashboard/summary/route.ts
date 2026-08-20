import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getNextAction } from "@/lib/dashboard";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const IS_DEV = process.env.NODE_ENV !== "production";

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

    if (error) {
      throw new Error(error.message);
    }

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
