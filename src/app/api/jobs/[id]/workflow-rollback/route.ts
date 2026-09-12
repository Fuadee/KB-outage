import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureSystemCertificateAuthorities } from "@/lib/serverTls";
import {
  isWorkflowRollbackTarget,
  type WorkflowRollbackTarget
} from "@/lib/workflowRollback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function createSupabaseAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase server configuration");
  }
  ensureSystemCertificateAuthorities();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" })
    }
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function errorResponse(error: SupabaseErrorLike) {
  const detail = [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");

  if (/Job not found|P0002/i.test(detail)) {
    return NextResponse.json(
      { ok: false, code: "JOB_NOT_FOUND", error: "ไม่พบข้อมูลงานที่ต้องการ" },
      { status: 404 }
    );
  }
  if (/Invalid rollback|not before current workflow step|22023/i.test(detail)) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_ROLLBACK",
        error: "ไม่สามารถย้อนกลับไปยังขั้นตอนที่เลือกจากสถานะปัจจุบันได้"
      },
      { status: 409 }
    );
  }
  if (/rollback_outage_job_workflow|outage_job_workflow_audit|PGRST202|42P01/i.test(detail)) {
    return NextResponse.json(
      {
        ok: false,
        code: "MIGRATION_REQUIRED",
        error: "ฐานข้อมูลยังไม่ได้ติดตั้ง migration สำหรับการย้อน Workflow"
      },
      { status: 503 }
    );
  }

  console.error("[workflow-rollback] database operation failed", {
    code: error.code,
    message: error.message,
    details: error.details
  });
  return NextResponse.json(
    { ok: false, code: "DATABASE_ERROR", error: "ย้อน Workflow ไม่สำเร็จ กรุณาลองใหม่" },
    { status: 500 }
  );
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const jobId = params.id?.trim();
  if (!jobId || !isUuid(jobId)) {
    return NextResponse.json(
      { ok: false, error: "รหัสงานไม่ถูกต้อง" },
      { status: 400 }
    );
  }
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("outage_job_workflow_audit")
      .select("id, job_id, action, from_step, to_step, reason, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return errorResponse(error);
    return NextResponse.json(
      { ok: true, history: data ?? [] },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return errorResponse({ message: error instanceof Error ? error.message : String(error) });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const jobId = params.id?.trim();
  if (!jobId || !isUuid(jobId)) {
    return NextResponse.json(
      { ok: false, error: "รหัสงานไม่ถูกต้อง" },
      { status: 400 }
    );
  }
  let body: { target_step?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "รูปแบบคำขอไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  if (!isWorkflowRollbackTarget(body.target_step)) {
    return NextResponse.json(
      { ok: false, error: "จุดที่จะย้อนไม่ถูกต้อง" },
      { status: 400 }
    );
  }
  const targetStep: WorkflowRollbackTarget = body.target_step;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 500) {
    return NextResponse.json(
      { ok: false, error: "กรุณาระบุเหตุผลในการย้อนสถานะ (ไม่เกิน 500 ตัวอักษร)" },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("rollback_outage_job_workflow", {
      p_job_id: jobId,
      p_target_step: targetStep,
      p_reason: reason
    });

    if (error) return errorResponse(error);
    const result = data as { job?: Record<string, unknown>; audit?: Record<string, unknown> } | null;
    if (!result?.job) {
      return NextResponse.json(
        { ok: false, error: "ฐานข้อมูลไม่ส่งสถานะงานที่อัปเดตกลับมา" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, job: result.job, audit: result.audit });
  } catch (error) {
    return errorResponse({ message: error instanceof Error ? error.message : String(error) });
  }
}

