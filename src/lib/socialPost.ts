import { formatOutagePeriods, formatThaiOutageDate, type OutagePeriod } from "./outagePeriods.ts";

export type SocialPostJob = {
  outage_periods?: OutagePeriod[] | null;
  outage_date: string;
  doc_purpose: string | null;
  doc_area_title: string | null;
  doc_time_start: string | null;
  doc_time_end: string | null;
  doc_area_detail: string | null;
  map_link: string | null;
  social_post_text?: string | null;
};

export function formatThaiFullDate(dateString: string) {
  return formatThaiOutageDate(dateString);
}

export function buildSocialPostText(job: SocialPostJob) {
  const docPurpose = job.doc_purpose ?? "";
  const docAreaTitle = job.doc_area_title ?? "";
  const docAreaDetail = job.doc_area_detail ?? "";
  const mapLink = job.map_link ?? "";
  const outageDateTh = formatThaiFullDate(job.outage_date);

  return [
    `เพื่อ${docPurpose} บริเวณ ${docAreaTitle}`,
    `📅${outageDateTh}`,
    `☣️โซนสีเหลือง แสดงพื้นที่ไฟดับ ตั้งแต่เวลา ${formatOutagePeriods(job)}`,
    `🌏บริเวณพื้นที่ผู้ใช้ไฟได้รับผลกระทบ ${docAreaDetail}`,
    `📌กดลิ้งค์ 👇 เพื่อตรวจสอบพื้นที่ไฟดับ ${mapLink}`
  ].join("\n");
}

export function getSocialPostPreview(job: SocialPostJob) {
  return buildSocialPostText(job);
}
