import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeJobId } from "@/lib/closeJob";
import { authorizeServerRequest } from "@/lib/serverAuth";
import { ensureSystemCertificateAuthorities } from "@/lib/serverTls";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type CloseErrorCode =
  | "DATABASE_ERROR"
  | "NETWORK_ERROR"
  | "PERMISSION_DENIED";

function createSupabaseAdminClient() {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }

  // Node does not always include the Windows certificate store by default.
  // Add trusted system CAs without disabling TLS certificate verification.
  ensureSystemCertificateAuthorities();

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function classifySupabaseError(error: SupabaseErrorLike): {
  code: CloseErrorCode;
  status: number;
  message: string;
} {
  const detail = [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");

  if (
    /fetch failed|network|self.signed|certificate|econn|enotfound|etimedout/i.test(
      detail
    )
  ) {
    return {
      code: "NETWORK_ERROR",
      status: 503,
      message: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง"
    };
  }

  if (
    error.code === "42501" ||
    /permission|row.level security|\brls\b|jwt|not authorized/i.test(detail)
  ) {
    return {
      code: "PERMISSION_DENIED",
      status: 403,
      message: "ไม่มีสิทธิ์ปิดงานนี้ กรุณาตรวจสอบสิทธิ์หรือ RLS policy"
    };
  }

  return {
    code: "DATABASE_ERROR",
    status: 500,
    message: "ฐานข้อมูลไม่สามารถบันทึกการปิดงานได้ กรุณาลองใหม่อีกครั้ง"
  };
}

function supabaseErrorResponse(
  error: SupabaseErrorLike,
  jobId: string,
  operation: "update" | "diagnostic lookup"
) {
  const classified = classifySupabaseError(error);
  console.error("[close-job] Supabase operation failed", {
    jobId,
    operation,
    code: error.code,
    message: error.message,
    classification: classified.code
  });

  return NextResponse.json(
    { ok: false, code: classified.code, error: classified.message },
    { status: classified.status }
  );
}

export async function POST(
  _request: Request,
  context: { params: { id: string } }
) {
  const jobId = normalizeJobId(context.params.id);

  if (!jobId) {
    return NextResponse.json(
      { ok: false, code: "INVALID_JOB_ID", error: "รหัสงานไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    const { authorized, user } = await authorizeServerRequest();
    if (!authorized) {
      return NextResponse.json(
        { ok: false, code: "AUTH_REQUIRED", error: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      );
    }

    const admin = createSupabaseAdminClient();
    const closedAt = new Date().toISOString();

    // The primary key is the source of truth. The conditional update also
    // makes closing idempotent and safe when requests arrive concurrently.
    const { data: updatedJob, error: updateError } = await admin
      .from("outage_jobs")
      .update({
        is_closed: true,
        closed_at: closedAt,
        closed_by: user?.id ?? null
      })
      .eq("id", jobId)
      .eq("is_closed", false)
      .or("social_status.eq.POSTED,social_posted_at.not.is.null")
      .select("id, is_closed, closed_at")
      .maybeSingle();

    if (updateError) {
      return supabaseErrorResponse(updateError, jobId, "update");
    }

    if (updatedJob) {
      return NextResponse.json({
        ok: true,
        jobId: updatedJob.id,
        is_closed: updatedJob.is_closed,
        closed_at: updatedJob.closed_at
      });
    }

    // Only query after a zero-row update so that not-found, already-closed,
    // and invalid workflow state receive distinct responses.
    const { data: currentJob, error: lookupError } = await admin
      .from("outage_jobs")
      .select("id, is_closed, closed_at, social_status, social_posted_at")
      .eq("id", jobId)
      .maybeSingle();

    if (lookupError) {
      return supabaseErrorResponse(lookupError, jobId, "diagnostic lookup");
    }

    if (!currentJob) {
      return NextResponse.json(
        {
          ok: false,
          code: "JOB_NOT_FOUND",
          error: "ไม่พบงานที่ตรงกับรหัสงานนี้"
        },
        { status: 404 }
      );
    }

    if (currentJob.is_closed) {
      return NextResponse.json({
        ok: true,
        jobId: currentJob.id,
        is_closed: true,
        closed_at: currentJob.closed_at,
        message: "already closed"
      });
    }

    return NextResponse.json(
      {
        ok: false,
        code: "JOB_NOT_READY",
        error: "สถานะงานยังไม่พร้อมสำหรับการปิดงาน"
      },
      { status: 409 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/Missing SUPABASE_/i.test(message)) {
      console.error("[close-job] Server configuration error", { message });
      return NextResponse.json(
        {
          ok: false,
          code: "SERVER_CONFIG_ERROR",
          error: "การตั้งค่าเซิร์ฟเวอร์สำหรับฐานข้อมูลไม่สมบูรณ์"
        },
        { status: 500 }
      );
    }

    const classified = classifySupabaseError({ message });
    console.error("[close-job] Unexpected server error", {
      jobId,
      message,
      classification: classified.code
    });
    return NextResponse.json(
      { ok: false, code: classified.code, error: classified.message },
      { status: classified.status }
    );
  }
}
