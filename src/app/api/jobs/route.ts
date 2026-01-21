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

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(value: string) {
  if (!DATE_REGEX.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

type JobStatusSource = {
  doc_status: string | null;
  social_status: string | null;
  notice_status: string | null;
  is_closed: boolean | null;
};

function deriveJobStatus(job: JobStatusSource) {
  if (job.is_closed) return "Done";
  if ((job.notice_status ?? "NONE") === "SCHEDULED") return "Notice";
  if ((job.social_status ?? "DRAFT") === "POSTED") return "Posted";
  if (["GENERATED", "GENERATING"].includes(job.doc_status ?? "PENDING")) {
    return "Doc";
  }
  return "Draft";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? "";

    if (!date || !isValidDateString(date)) {
      return NextResponse.json(
        { ok: false, error: "Invalid or missing date" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("outage_jobs")
      .select(
        "id, outage_date, doc_time_start, doc_time_end, doc_area_title, doc_status, social_status, notice_status, is_closed, created_at"
      )
      .eq("outage_date", date)
      .order("doc_time_start", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const jobs = (data ?? []).map((job) => ({
      id: job.id,
      outage_date: job.outage_date,
      time_start: job.doc_time_start ?? null,
      time_end: job.doc_time_end ?? null,
      area_title: job.doc_area_title ?? null,
      status: deriveJobStatus(job)
    }));

    return NextResponse.json(jobs);
  } catch (error) {
    console.error("Jobs by date failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
