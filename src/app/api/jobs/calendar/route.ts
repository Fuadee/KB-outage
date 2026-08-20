import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getLegacyCalendarStatus } from "@/lib/documentWorkflow";

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
  doc_generated_at: string | null;
  document_received_at: string | null;
  document_delivered_at: string | null;
  social_status: string | null;
  social_posted_at: string | null;
  notice_status: string | null;
  notice_date: string | null;
  is_closed: boolean | null;
};
type DerivedStatus = "Done" | "Notice" | "Posted" | "Doc" | "Draft";
function deriveJobStatus(job: JobStatusSource): DerivedStatus {
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
        "outage_date, doc_status, doc_generated_at, document_received_at, document_delivered_at, social_status, social_posted_at, notice_status, notice_date, is_closed"
      )
      .gte("outage_date", from)
      .lte("outage_date", to);

    if (error) {
      throw new Error(error.message);
    }

    const summaryMap = new Map<
  string,
  { date: string; total: number; byStatus: Record<DerivedStatus, number> }
>();

    (data ?? []).forEach((job) => {
      const date = job.outage_date;
      if (!date) return;


const status = deriveJobStatus(job);

type SummaryRow = {
  date: string;
  total: number;
  byStatus: Record<DerivedStatus, number>;
};

const existing: SummaryRow =
  summaryMap.get(date) ??
  ({
    date,
    total: 0,
    byStatus: {} as Record<DerivedStatus, number>
  } satisfies SummaryRow);

existing.total += 1;
existing.byStatus[status] = (existing.byStatus[status] ?? 0) + 1;

summaryMap.set(date, existing);

    });

    const summary = Array.from(summaryMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Calendar summary failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
