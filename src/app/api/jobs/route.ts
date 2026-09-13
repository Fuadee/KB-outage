import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getLegacyCalendarStatus } from "@/lib/documentWorkflow";
import { isShiftOneDistributionPending } from "@/lib/distributionWorkflow";
import { isResponsibleUnit, parseCustomerCount } from "@/lib/jobMetadata";
import { ensureSystemCertificateAuthorities } from "@/lib/serverTls";

export const runtime = "nodejs";

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

function deriveJobStatus(job: JobStatusSource) {
  return getLegacyCalendarStatus(job);
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
        "id, outage_date, equipment_code, responsible_unit, work_supervisor_name, has_switching, doc_time_start, doc_time_end, doc_area_title, doc_purpose, doc_status, doc_generated_at, document_received_at, document_delivered_at, social_status, social_posted_at, notice_status, notice_date, notice_completed_at, is_closed, created_at"
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
      equipment_code: job.equipment_code,
      responsible_unit: job.responsible_unit ?? null,
      work_supervisor_name: job.work_supervisor_name ?? null,
      has_switching: job.has_switching ?? null,
      requires_shift_one_distribution: isShiftOneDistributionPending(job),
      time_start: job.doc_time_start ?? null,
      time_end: job.doc_time_end ?? null,
      area_title: job.doc_area_title ?? null,
      display_area: job.doc_area_title ?? job.doc_purpose ?? null,
      status: deriveJobStatus(job)
    }));

    return NextResponse.json(jobs, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (error) {
    console.error("Jobs by date failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    ensureSystemCertificateAuthorities();

    const body = (await request.json().catch(() => null)) as {
      outage_date?: unknown;
      equipment_code?: unknown;
      responsible_unit?: unknown;
      work_supervisor_name?: unknown;
      has_switching?: unknown;
      customer_count?: unknown;
      note?: unknown;
    } | null;
    const outageDate =
      typeof body?.outage_date === "string" ? body.outage_date : "";
    const equipmentCode =
      typeof body?.equipment_code === "string"
        ? body.equipment_code.trim()
        : "";
    const customerCount = parseCustomerCount(body?.customer_count);
    const workSupervisorName =
      typeof body?.work_supervisor_name === "string"
        ? body.work_supervisor_name.trim() || null
        : null;

    if (!customerCount.success) {
      return NextResponse.json(
        { ok: false, error: customerCount.error },
        { status: 400 }
      );
    }

    if (typeof body?.has_switching !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "กรุณาเลือกว่ามี Switching หรือไม่มี Switching" },
        { status: 400 }
      );
    }

    if (
      !isValidDateString(outageDate) ||
      !equipmentCode ||
      !isResponsibleUnit(body?.responsible_unit) ||
      (body?.work_supervisor_name !== undefined &&
        body.work_supervisor_name !== null &&
        typeof body.work_supervisor_name !== "string") ||
      (body?.note !== undefined &&
        body.note !== null &&
        typeof body.note !== "string")
    ) {
      return NextResponse.json(
        { ok: false, error: "ข้อมูลสร้างงานไม่ถูกต้อง กรุณาเลือกหน่วยงานผู้รับผิดชอบ" },
        { status: 400 }
      );
    }

    const note = typeof body.note === "string" ? body.note.trim() || null : null;
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("outage_jobs")
      .insert({
        outage_date: outageDate,
        equipment_code: equipmentCode,
        responsible_unit: body.responsible_unit,
        work_supervisor_name: workSupervisorName,
        has_switching: body.has_switching,
        customer_count: customerCount.value,
        note
      })
      .select(
        "id, outage_date, equipment_code, responsible_unit, work_supervisor_name, has_switching, customer_count, note"
      )
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    console.error("Create job failed", error);
    return NextResponse.json(
      { ok: false, error: "สร้างงานไม่สำเร็จ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
