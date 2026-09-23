import type { SocialPostJob } from "./socialPost.ts";

export const MAX_SOCIAL_IMAGE_BYTES = 3 * 1024 * 1024;
export const SOCIAL_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];
export function socialImageSnapshot(job: SocialPostJob & { equipment_code?: string }) {
  return {
    outage_date: job.outage_date, doc_time_start: job.doc_time_start,
    doc_time_end: job.doc_time_end, doc_area_title: job.doc_area_title,
    doc_area_detail: job.doc_area_detail, doc_purpose: job.doc_purpose,
    map_link: job.map_link, equipment_code: job.equipment_code ?? null
  };
}
export type SocialImageSnapshot = ReturnType<typeof socialImageSnapshot>;
export type SocialImageAsset = {
  id: string; source_path: string; generated_path: string; generated_at: string;
  snapshot: SocialImageSnapshot; source_url?: string; generated_url?: string;
};
export function isSocialImageStale(job: SocialPostJob & { equipment_code?: string }, asset: SocialImageAsset) {
  const current = socialImageSnapshot(job);
  return Object.keys(current).some(key => current[key as keyof typeof current] !== asset.snapshot[key as keyof typeof current]);
}
export function validateSocialImageJob(job: SocialPostJob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(job.outage_date) || !Number.isFinite(Date.parse(job.outage_date)) ||
      !job.doc_area_title?.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(job.doc_time_start ?? "") ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(job.doc_time_end ?? "")) {
    throw new Error("กรุณาบันทึกวันที่ เวลา และพื้นที่ในข้อมูลงานให้ครบก่อนสร้างภาพ");
  }
}
