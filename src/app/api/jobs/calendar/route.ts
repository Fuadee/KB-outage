import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getLegacyCalendarStatus } from "@/lib/documentWorkflow";
import { isShiftOneDistributionPending } from "@/lib/distributionWorkflow";
import { ensureSystemCertificateAuthorities } from "@/lib/serverTls";
import {
  buildCalendarSummary,
  type CalendarStatus
} from "@/lib/calendarSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const fetchWithoutCache: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

function createSupabaseServerClient() {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }

  ensureSystemCertificateAuthorities();

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithoutCache }
  });
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
  doc_generated_at: string | null;
  document_received_at: string | null;
  document_delivered_at: string | null;
  social_status: string | null;
  social_posted_at: string | null;
  notice_status: string | null;
  notice_date: string | null;
  notice_completed_at?: string | null;
  is_closed: boolean | null;
};
function deriveJobStatus(job: JobStatusSource): CalendarStatus {
  return getLegacyCalendarStatus(job);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";

    if (!from || !to || !isValidDateString(from) || !isValidDateString(to)) {
      return NextResponse.json(
        { ok: false, error: "Invalid or missing date range" },
        { status: 400 }
      );
    }

    if (from > to) {
      return NextResponse.json(
        { ok: false, error: "from must be before to" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("outage_jobs")
      .select(
        "outage_date, responsible_unit, has_switching, doc_status, doc_generated_at, document_received_at, document_delivered_at, social_status, social_posted_at, notice_status, notice_date, notice_completed_at, is_closed"
      )
      .gte("outage_date", from)
      .lte("outage_date", to);

    if (error) {
      throw new Error(error.message);
    }

    const summary = buildCalendarSummary(
      (data ?? []).flatMap((job) => {
        if (!job.outage_date) return [];
        return [
          {
            date: job.outage_date,
            responsible_unit: job.responsible_unit,
            has_switching: job.has_switching,
            requires_shift_one_distribution: isShiftOneDistributionPending(job),
            status: deriveJobStatus(job)
          }
        ];
      })
    );

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (error) {
    console.error("Calendar summary failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
