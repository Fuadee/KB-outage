import { parseLocalDate } from "./dateUtils";

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม"
];

export type SocialPostJob = {
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
  if (!dateString) return "";
  const date = parseLocalDate(dateString);
  const day = date.getDate();
  const month = THAI_MONTHS[date.getMonth()] ?? "";
  const year = date.getFullYear() + 543;
  return `${day} ${month} ${year}`.trim();
}

export function buildSocialPostText(job: SocialPostJob) {
  const docPurpose = job.doc_purpose ?? "";
  const docAreaTitle = job.doc_area_title ?? "";
  const docTimeStart = job.doc_time_start ?? "";
  const docTimeEnd = job.doc_time_end ?? "";
  const docAreaDetail = job.doc_area_detail ?? "";
  const mapLink = job.map_link ?? "";
  const outageDateTh = formatThaiFullDate(job.outage_date);

  return [
    `เพื่อ${docPurpose} บริเวณ ${docAreaTitle}`,
    `📅${outageDateTh}`,
    `☣️โซนสีเหลือง แสดงพื้นที่ไฟดับ ตั้งแต่เวลา ${docTimeStart} .- ${docTimeEnd} น.`,
    `🌏บริเวณพื้นที่ผู้ใช้ไฟได้รับผลกระทบ ${docAreaDetail}`,
    `📌กดลิ้งค์ 👇 เพื่อตรวจสอบพื้นที่ไฟดับ ${mapLink}`
  ].join("\n");
}

export function getSocialPostPreview(job: SocialPostJob) {
  return job.social_post_text?.trim()
    ? job.social_post_text
    : buildSocialPostText(job);
}
