import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeServerRequest } from "@/lib/serverAuth";
import { ensureSystemCertificateAuthorities } from "@/lib/serverTls";
import { getDistributionWorkflow } from "@/lib/distributionWorkflow";

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
  ensureSystemCertificateAuthorities();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText))
  );
  return (
    date.getUTCFullYear() === Number(yearText) &&
    date.getUTCMonth() === Number(monthText) - 1 &&
    date.getUTCDate() === Number(dayText)
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      jobId?: string;
      notice_date?: string;
    };

    const jobId = body?.jobId?.trim();
    const noticeDate = body?.notice_date;

    if (
      !jobId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        jobId
      )
    ) {
      return NextResponse.json(
        { ok: false, error: "missing jobId" },
        { status: 400 }
      );
    }

    if (!isValidDateOnly(noticeDate)) {
      return NextResponse.json(
        { ok: false, error: "missing required fields" },
        { status: 400 }
      );
    }

    const { authorized } = await authorizeServerRequest();
    if (!authorized) {
      return NextResponse.json(
        { ok: false, error: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      );
    }

    const supabase = createSupabaseServerClient();
    const scheduledAt = new Date().toISOString();

    const { data: current, error: lookupError } = await supabase
      .from("outage_jobs")
      .select("id, responsible_unit, is_closed, document_delivered_at, notice_status, notice_date, notice_completed_at")
      .eq("id", jobId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!current) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบข้อมูลงานที่ต้องการ" },
        { status: 404 }
      );
    }
    if (current.is_closed) {
      return NextResponse.json(
        { ok: false, error: "งานนี้ปิดแล้ว หากต้องแก้ไขให้ย้อนขั้นตอนก่อน" },
        { status: 409 }
      );
    }
    if (!current.document_delivered_at) {
      return NextResponse.json(
        { ok: false, error: "ต้องบันทึกการส่งเอกสารก่อนกำหนดการแจกหนังสือ" },
        { status: 409 }
      );
    }
    const distributionWorkflow = getDistributionWorkflow(current);
    if (distributionWorkflow.completed) {
      return NextResponse.json(
        { ok: false, error: "งานนี้แจกหนังสือเสร็จแล้ว ไม่สามารถสร้างกำหนดการใหม่ได้" },
        { status: 409 }
      );
    }
    if (distributionWorkflow.route !== "OPERATIONS") {
      return NextResponse.json(
        { ok: false, error: "กำหนดวันแจกใช้เฉพาะงานแผนกปฏิบัติการ" },
        { status: 409 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("outage_jobs")
      .update({
        notice_status: "SCHEDULED",
        notice_date: noticeDate,
        notice_scheduled_at: scheduledAt
      })
      .eq("id", jobId)
      .select("notice_status, notice_date, notice_by, notice_scheduled_at")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      ok: true,
      job: updated,
      notice_scheduled_at: scheduledAt
    });
  } catch (error) {
    console.error("Notice schedule failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถบันทึกกำหนดการได้ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
