import type { SocialPostJob } from "./socialPost.ts";

export const MAX_SOCIAL_IMAGE_BYTES = 3 * 1024 * 1024;
export const SOCIAL_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];
export type SocialMapView = { mode: "fit" | "fill"; zoom: number; x: number; y: number };
export const DEFAULT_SOCIAL_MAP_VIEW: SocialMapView = { mode: "fit", zoom: 1, x: 0.5, y: 0.5 };
export function parseSocialMapView(value: unknown): SocialMapView {
  if (value == null) return { ...DEFAULT_SOCIAL_MAP_VIEW };
  if (typeof value !== "object" || !value) throw new Error("ตำแหน่งภาพแผนที่ไม่ถูกต้อง");
  const view = value as Partial<SocialMapView>;
  if (view.mode === "fit") return { ...DEFAULT_SOCIAL_MAP_VIEW };
  if (view.mode !== "fill" || typeof view.zoom !== "number" || !Number.isFinite(view.zoom) || view.zoom < 1 || view.zoom > 3 ||
      typeof view.x !== "number" || !Number.isFinite(view.x) || view.x < 0 || view.x > 1 ||
      typeof view.y !== "number" || !Number.isFinite(view.y) || view.y < 0 || view.y > 1) throw new Error("ตำแหน่งภาพแผนที่ไม่ถูกต้อง");
  return { mode: "fill", zoom: view.zoom, x: view.x, y: view.y };
}
export function socialMapPlacement(sourceWidth: number, sourceHeight: number, viewportWidth: number, viewportHeight: number, view: SocialMapView) {
  const scale = (view.mode === "fit" ? Math.min : Math.max)(viewportWidth / sourceWidth, viewportHeight / sourceHeight) * (view.mode === "fill" ? view.zoom : 1);
  const width = sourceWidth * scale, height = sourceHeight * scale;
  return { width, height, left: (viewportWidth - width) * view.x, top: (viewportHeight - height) * view.y };
}
export function socialImageSnapshot(job: SocialPostJob & { equipment_code?: string }) {
  return {
    outage_date: job.outage_date, doc_time_start: job.doc_time_start,
    doc_time_end: job.doc_time_end, doc_area_title: job.doc_area_title,
    doc_area_detail: job.doc_area_detail, doc_purpose: job.doc_purpose,
    map_link: job.map_link, equipment_code: job.equipment_code ?? null
  };
}
export type SocialImageSnapshot = ReturnType<typeof socialImageSnapshot> & { map_view?: SocialMapView };
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
