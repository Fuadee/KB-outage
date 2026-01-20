import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildSocialPostText,
  getSocialPostPreview
} from "@/lib/socialPost";

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
    if (process.env.NODE_ENV === "development") {
      console.info("Social post request body:", body);
    }
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
      .select(
        "id, outage_date, doc_purpose, doc_area_title, doc_time_start, doc_time_end, doc_area_detail, map_link, social_status, social_post_text, social_posted_at, notice_status, notice_date, notice_by, mymaps_url, notice_scheduled_at"
      )
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบข้อมูลงานที่ต้องการ" },
        { status: 404 }
      );
    }

    const previewText = getSocialPostPreview({
      outage_date: job.outage_date,
      doc_purpose: job.doc_purpose,
      doc_area_title: job.doc_area_title,
      doc_time_start: job.doc_time_start,
      doc_time_end: job.doc_time_end,
      doc_area_detail: job.doc_area_detail,
      map_link: job.map_link,
      social_post_text: job.social_post_text
    });

    if (job.social_status === "POSTED" && job.social_post_text) {
      return NextResponse.json({
        ok: true,
        preview_text: previewText,
        social_status: "POSTED",
        social_post_text: job.social_post_text,
        social_posted_at: job.social_posted_at,
        job: {
          social_status: "POSTED",
          social_post_text: job.social_post_text,
          social_posted_at: job.social_posted_at,
          notice_status: job.notice_status,
          notice_date: job.notice_date,
          notice_by: job.notice_by,
          mymaps_url: job.mymaps_url,
          notice_scheduled_at: job.notice_scheduled_at
        }
      });
    }

    const postedAt = job.social_posted_at ?? new Date().toISOString();
    const postText = previewText || buildSocialPostText(job);

    const { data: updatedJob, error: updateError } = await supabase
      .from("outage_jobs")
      .update({
        social_status: "POSTED",
        social_post_text: postText,
        social_posted_at: postedAt
      })
      .eq("id", jobId)
      .select(
        "social_status, social_post_text, social_posted_at, notice_status, notice_date, notice_by, mymaps_url, notice_scheduled_at"
      )
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (process.env.NODE_ENV === "development") {
      console.info("Social post updated job:", {
        jobId,
        social_status: updatedJob?.social_status,
        social_posted_at: updatedJob?.social_posted_at,
        notice_status: updatedJob?.notice_status
      });
    }

    return NextResponse.json({
      ok: true,
      preview_text: postText,
      social_status: updatedJob?.social_status ?? "POSTED",
      social_post_text: updatedJob?.social_post_text ?? postText,
      social_posted_at: updatedJob?.social_posted_at ?? postedAt,
      job: updatedJob ?? {
        social_status: "POSTED",
        social_post_text: postText,
        social_posted_at: postedAt,
        notice_status: job.notice_status,
        notice_date: job.notice_date,
        notice_by: job.notice_by,
        mymaps_url: job.mymaps_url,
        notice_scheduled_at: job.notice_scheduled_at
      }
    });
  } catch (error) {
    console.error("Social post failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถโพสต์ข้อความได้ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
