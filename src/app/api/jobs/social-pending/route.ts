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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { jobId?: string | number };
    console.info("Social pending request body:", body);
    const jobId = body?.jobId;

    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "missing jobId" },
        { status: 400 }
      );
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY env var." },
        { status: 500 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data: job, error: jobError } = await supabase
      .from("outage_jobs")
      .select("id, social_status")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบข้อมูลงานที่ต้องการ" },
        { status: 404 }
      );
    }

    const currentStatus = job.social_status ?? "DRAFT";

    if (currentStatus === "DRAFT") {
      const { error: updateError } = await supabase
        .from("outage_jobs")
        .update({ social_status: "PENDING_APPROVAL" })
        .eq("id", jobId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      return NextResponse.json({
        ok: true,
        social_status: "PENDING_APPROVAL"
      });
    }

    return NextResponse.json({
      ok: true,
      social_status: currentStatus
    });
  } catch (error) {
    console.error("Social pending failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถอัปเดตสถานะได้ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
