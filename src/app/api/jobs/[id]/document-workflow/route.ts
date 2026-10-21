import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveDocumentDeliverySender } from "@/lib/documentDeliverySender";
import { PERSON_ID_PATTERN } from "@/lib/peopleServer";
import { isDocumentReady } from "@/lib/documentWorkflow";
import { ensureSystemCertificateAuthorities } from "@/lib/serverTls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type WorkflowRequest = {
  action?: "receive" | "deliver";
  occurred_at?: string;
  operator?: string;
  note?: string;
  person_id?: unknown;
  preserve_existing_sender?: unknown;
  sender_status?: unknown;
  unknown_reason?: unknown;
  delivery_confirmed?: unknown;
};

function createSupabaseServerClient() {
  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL env var.");
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  ensureSystemCertificateAuthorities();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function normalizeDateTime(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id?.trim();
    const body = (await request.json()) as WorkflowRequest;
    if (!jobId || (body.action !== "receive" && body.action !== "deliver")) {
      return NextResponse.json(
        { ok: false, error: "ข้อมูลคำขอไม่ครบถ้วน" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data: job, error: jobError } = await supabase
      .from("outage_jobs")
      .select(
        "id, doc_status, doc_generated_at, social_status, social_posted_at, notice_status, notice_date, is_closed, document_received_at, document_received_by, document_delivered_at, document_delivered_by, document_delivered_by_person_id, document_delivered_by_department, document_delivery_sender_status, document_delivery_unknown_reason, document_delivery_confirmed_at, document_delivery_note"
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
      // Existing confirmations, including legacy names, are immutable here.
      // Corrections use the audited workflow rollback operation.
      if (job.document_received_at) {
        return NextResponse.json({ ok: true, job });
      }
      if (!isDocumentReady(job)) {
        return NextResponse.json(
          { ok: false, error: "ต้องสร้างเอกสารให้พร้อมก่อนบันทึกการรับเอกสาร" },
          { status: 409 }
        );
      }
      const { data: received, error: receiveError } = await supabase
        .from("outage_jobs")
        .update({ document_received_at: new Date().toISOString(), document_received_by: null })
        .eq("id", jobId)
        .is("document_received_at", null)
        .eq("is_closed", false)
        .or("doc_status.eq.GENERATED,doc_generated_at.not.is.null")
        .select("document_received_at, document_received_by")
        .maybeSingle();
      if (receiveError) throw new Error(receiveError.message);
      if (received) return NextResponse.json({ ok: true, job: received });

      // A concurrent confirmation may have won. Return its original timestamp
      // rather than overwriting it or reporting a false failure to the caller.
      const { data: current, error: currentError } = await supabase
        .from("outage_jobs")
        .select("document_received_at, document_received_by, is_closed")
        .eq("id", jobId)
        .single();
      if (currentError) throw new Error(currentError.message);
      if (current?.document_received_at && !current.is_closed) {
        return NextResponse.json({ ok: true, job: current });
      }
      return NextResponse.json(
        { ok: false, error: "สถานะงานเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่ก่อนยืนยันรับเอกสาร" },
        { status: 409 }
      );
    } else if (body.action === "deliver") {
      if (!job.document_received_at) {
        return NextResponse.json(
          { ok: false, error: "ต้องบันทึกการรับเอกสารก่อนบันทึกการส่ง" },
          { status: 409 }
        );
      }
      const occurredAt = normalizeDateTime(body.occurred_at);
      const sender = await resolveDocumentDeliverySender(supabase, job, body);
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (!occurredAt || !sender || note.length > 1000) {
        return NextResponse.json(
          { ok: false, error: "กรุณาเลือกบุคลากร หรือระบุเหตุผลที่ไม่ทราบชื่อและยืนยันว่าส่งเอกสารจริงแล้ว ตรวจสอบวันเวลาและข้อความไม่เกิน 1,000 ตัวอักษร" },
          { status: 400 }
        );
      }
      if (new Date(occurredAt) < new Date(job.document_received_at)) {
        return NextResponse.json(
          { ok: false, error: "เวลาส่งเอกสารต้องไม่ก่อนเวลารับเอกสาร" },
          { status: 400 }
        );
      }
      if (body.sender_status === "UNKNOWN" && new Date(occurredAt).getTime() > Date.now()) {
        return NextResponse.json(
          { ok: false, error: "ยืนยันว่าส่งจริงแล้วไม่ได้ หากเวลาส่งยังเป็นเวลาในอนาคต" },
          { status: 400 }
        );
      }
      patch = {
        document_delivered_at: occurredAt,
        ...sender,
        document_delivery_note: note || null
      };
    } else {
      return NextResponse.json(
        { ok: false, error: "คำขอแก้ไข Workflow ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("outage_jobs")
      .update(patch)
      .eq("id", jobId)
      .select(
        "document_received_at, document_received_by, document_delivered_at, document_delivered_by, document_delivered_by_person_id, document_delivered_by_department, document_delivery_sender_status, document_delivery_unknown_reason, document_delivery_confirmed_at, document_delivery_note"
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

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  if (!PERSON_ID_PATTERN.test(params.id)) {
    return NextResponse.json({ ok: false, error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
  }
  try {
    const { data, error } = await createSupabaseServerClient()
      .from("outage_job_document_delivery_audit")
      .select("id, before_state, after_state, created_at")
      .eq("job_id", params.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ ok: true, history: data ?? [] }, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (error) {
    console.error("Document delivery history failed", error);
    return NextResponse.json({ ok: false, error: "โหลดประวัติการส่งเอกสารไม่สำเร็จ" }, { status: 500 });
  }
}
