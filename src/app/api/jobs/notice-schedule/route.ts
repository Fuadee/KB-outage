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
    const body = (await request.json()) as {
      jobId?: string | number;
      notice_date?: string;
      notice_by?: string;
      mymaps_url?: string;
    };

    const jobId = body?.jobId;
    const noticeDate = body?.notice_date;
    const noticeBy = body?.notice_by?.trim();
    const mymapsUrl = body?.mymaps_url?.trim();

    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "missing jobId" },
        { status: 400 }
      );
    }

    if (!noticeDate || !noticeBy || !mymapsUrl) {
      return NextResponse.json(
        { ok: false, error: "missing required fields" },
        { status: 400 }
      );
    }

    if (!/^https?:\/\//i.test(mymapsUrl)) {
      return NextResponse.json(
        { ok: false, error: "invalid mymaps_url" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const scheduledAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("outage_jobs")
      .update({
        notice_status: "SCHEDULED",
        notice_date: noticeDate,
        notice_by: noticeBy,
        mymaps_url: mymapsUrl,
        notice_scheduled_at: scheduledAt
      })
      .eq("id", jobId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      ok: true,
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
