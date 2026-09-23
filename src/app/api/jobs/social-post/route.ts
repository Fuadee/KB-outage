import { NextResponse } from "next/server";
import { buildSocialPostText } from "@/lib/socialPost";
import { isDocumentReady, isNoticeCompleted } from "@/lib/documentWorkflow";
import { latestSocialImage, socialServerClient } from "@/lib/socialImageServer";
import { isSocialImageStale } from "@/lib/socialImage";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { jobId, imageId, confirmed } = await request.json();
    if (!jobId || !imageId || confirmed !== true) return NextResponse.json({ ok: false, error: "กรุณาสร้างภาพและตรวจสอบข้อมูลก่อนประชาสัมพันธ์" }, { status: 400 });
    const supabase = socialServerClient();
    const { data: job, error } = await supabase.from("outage_jobs").select("*").eq("id", jobId).single();
    if (error || !job) return NextResponse.json({ ok: false, error: "ไม่พบข้อมูลงาน" }, { status: 404 });
    const asset = await latestSocialImage(supabase, jobId);
    if (!asset || asset.id !== imageId || isSocialImageStale(job, asset)) return NextResponse.json({ ok: false, error: "ข้อมูลดับไฟมีการแก้ไขหลังจากสร้างภาพนี้ กรุณาสร้างภาพประชาสัมพันธ์ใหม่" }, { status: 409 });
    if (!isDocumentReady(job)) return NextResponse.json({ ok: false, error: "ต้องสร้างเอกสารให้พร้อมก่อนโพสต์ Social" }, { status: 409 });
    if (!isNoticeCompleted(job)) return NextResponse.json({ ok: false, code: "NOTICE_NOT_SCHEDULED", error: "ต้องยืนยันว่าแจกหนังสือแล้วก่อนโพสต์ Social" }, { status: 409 });
    if (!job.document_delivered_at) return NextResponse.json({ ok: false, code: "DOCUMENT_NOT_DELIVERED", error: "ขั้นตอนส่งเอกสารยังไม่ครบ" }, { status: 409 });
    const postText = buildSocialPostText(job);
    const { data: updatedJob, error: updateError } = await supabase.rpc("complete_social_announcement", { p_job_id: jobId, p_image_id: imageId, p_text: postText, p_confirmed: confirmed });
    if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 409 });
    const completedJob = Array.isArray(updatedJob) ? updatedJob[0] : updatedJob;
    if (!completedJob?.id) throw new Error("Social completion returned no job");
    return NextResponse.json({ ok: true, preview_text: postText, social_post_text: postText, social_status: "POSTED", social_posted_at: completedJob.social_posted_at, job: completedJob });
  } catch (error) {
    console.error("Social post failed", error);
    return NextResponse.json({ ok: false, error: "ไม่สามารถบันทึก Social ได้ กรุณาลองใหม่" }, { status: 500 });
  }
}
