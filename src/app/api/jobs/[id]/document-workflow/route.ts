import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isDocumentReady } from "@/lib/documentWorkflow";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type WorkflowRequest = {
  action?: "receive" | "deliver" | "clear-receipt" | "clear-delivery";
  occurred_at?: string;
  operator?: string;
  note?: string;
};

function createSupabaseServerClient() {
  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL env var.");
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function normalizeDateTime(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > maxLength) return null;
  return text;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id?.trim();
    const body = (await request.json()) as WorkflowRequest;
    if (!jobId || !body.action) {
      return NextResponse.json(
        { ok: false, error: "ข้อมูลคำขอไม่ครบถ้วน" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data: job, error: jobError } = await supabase
      .from("outage_jobs")
      .select(
        "id, doc_status, doc_generated_at, social_status, social_posted_at, notice_status, notice_date, is_closed, document_received_at, document_received_by, document_delivered_at, document_delivered_by, document_delivery_note"
      )
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบข้อมูลงานที่ต้องการ" },
        { status: 404 }
      );
    }
    if (job.is_closed) {
      return NextResponse.json(
        { ok: false, error: "งานนี้ปิดแล้ว จึงไม่สามารถแก้ไขข้อมูลเอกสารได้" },
        { status: 409 }
      );
    }

    let patch: Record<string, string | null>;
    if (body.action === "receive") {
      if (!isDocumentReady(job)) {
        return NextResponse.json(
          { ok: false, error: "ต้องสร้างเอกสารให้พร้อมก่อนบันทึกการรับเอกสาร" },
          { status: 409 }
        );
      }
      const occurredAt = normalizeDateTime(body.occurred_at);
      const operator = normalizeText(body.operator, 200);
      if (!occurredAt || !operator) {
        return NextResponse.json(
          { ok: false, error: "กรุณาระบุวันเวลาและชื่อผู้รับเอกสาร" },
          { status: 400 }
        );
      }
      patch = {
        document_received_at: occurredAt,
        document_received_by: operator
      };
    } else if (body.action === "deliver") {
      if (!job.document_received_at) {
        return NextResponse.json(
          { ok: false, error: "ต้องบันทึกการรับเอกสารก่อนบันทึกการส่ง" },
          { status: 409 }
        );
      }
      const occurredAt = normalizeDateTime(body.occurred_at);
      const operator = normalizeText(body.operator, 200);
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (!occurredAt || !operator || note.length > 1000) {
        return NextResponse.json(
          { ok: false, error: "กรุณาตรวจสอบวันเวลา ผู้ส่ง และหมายเหตุ (ไม่เกิน 1,000 ตัวอักษร)" },
          { status: 400 }
        );
      }
      if (new Date(occurredAt) < new Date(job.document_received_at)) {
        return NextResponse.json(
          { ok: false, error: "เวลาส่งเอกสารต้องไม่ก่อนเวลารับเอกสาร" },
          { status: 400 }
        );
      }
      patch = {
        document_delivered_at: occurredAt,
        document_delivered_by: operator,
        document_delivery_note: note || null
      };
    } else if (body.action === "clear-delivery") {
      patch = {
        document_delivered_at: null,
        document_delivered_by: null,
        document_delivery_note: null
      };
    } else {
      patch = {
        document_received_at: null,
        document_received_by: null,
        document_delivered_at: null,
        document_delivered_by: null,
        document_delivery_note: null
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from("outage_jobs")
      .update(patch)
      .eq("id", jobId)
      .select(
        "document_received_at, document_received_by, document_delivered_at, document_delivered_by, document_delivery_note"
      )
      .single();
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ ok: true, job: updated });
  } catch (error) {
    console.error("Document workflow update failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถบันทึกข้อมูลเอกสารได้ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
