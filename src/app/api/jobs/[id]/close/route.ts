import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, getAuthTokens } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createSupabaseAdminClient() {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const { accessToken } = getAuthTokens();
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, message: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const authClient = createServerClient();
    const {
      data: { user },
      error: userError
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, message: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const jobId = context.params.id;
    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "missing job id" },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();
    const { data: job, error: jobError } = await admin
      .from("outage_jobs")
      .select("id, is_closed, closed_at, notice_status")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบข้อมูลงานที่ต้องการ" },
        { status: 404 }
      );
    }

    if (job.is_closed) {
      return NextResponse.json({
        ok: true,
        jobId: job.id,
        is_closed: true,
        closed_at: job.closed_at,
        message: "already closed"
      });
    }

    if (job.notice_status !== "SCHEDULED") {
      return NextResponse.json(
        {
          ok: false,
          error: "สถานะงานยังไม่พร้อมสำหรับการปิดงาน"
        },
        { status: 400 }
      );
    }

    const closedAt = new Date().toISOString();
    const { data: updatedJob, error: updateError } = await admin
      .from("outage_jobs")
      .update({
        is_closed: true,
        closed_at: closedAt,
        closed_by: user.id
      })
      .eq("id", jobId)
      .select("id, is_closed, closed_at")
      .single();

    if (updateError || !updatedJob) {
      throw new Error(updateError?.message ?? "Failed to close job");
    }

    return NextResponse.json({
      ok: true,
      jobId: updatedJob.id,
      is_closed: updatedJob.is_closed,
      closed_at: updatedJob.closed_at
    });
  } catch (error) {
    console.error("Close job failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถปิดงานได้ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
