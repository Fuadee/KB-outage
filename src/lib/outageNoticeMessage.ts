import { formatCustomerCount } from "./jobMetadata.ts";
import { normalizeGoogleMyMapsViewerUrl } from "./mapUrl.ts";

export const OUTAGE_CALENDAR_URL = "https://kb-outage.vercel.app/calendar";
export const NOTICE_BOOK_PICKUP_LOCATION = "ผปบ. ชั้น 3";
export const NOTICE_ASSIGNMENT_RESPONSIBLE = "กะ 1";

export type OutageNoticeMessageJob = {
  outage_date: string;
  customer_count?: number | null;
  doc_purpose?: string | null;
  doc_area_title?: string | null;
  doc_area_detail?: string | null;
  doc_time_start?: string | null;
  doc_time_end?: string | null;
  map_link?: string | null;
};

function clean(value?: string | null): string {
  return value?.trim() ?? "";
}

export function getOutageNoticeAreaText(
  job: OutageNoticeMessageJob
): string {
  const area = clean(job.doc_area_title) || clean(job.doc_purpose);
  if (!area) return "ไม่ระบุพื้นที่";

  return /พื้นที่ใกล้เคียง\s*$/u.test(area)
    ? area
    : `${area} และพื้นที่ใกล้เคียง`;
}

export function buildOutageNoticeLineMessage(
  job: OutageNoticeMessageJob
): string {
  const customerCount =
    typeof job.customer_count === "number"
      ? formatCustomerCount(job.customer_count)
      : "ไม่ระบุ";
  const mapUrl =
    normalizeGoogleMyMapsViewerUrl(job.map_link) || "ไม่มีข้อมูลแผนที่";

  return [
    "📢 แจ้งงานแจกหนังสือดับไฟวันนี้",
    "",
    `📍 พื้นที่: ${getOutageNoticeAreaText(job)}`,
    `📄 จำนวนหนังสือ: ${customerCount} ราย`,
    `👷 ผู้ดำเนินการ: ${NOTICE_ASSIGNMENT_RESPONSIBLE}`,
    `📌 รับหนังสือ: ${NOTICE_BOOK_PICKUP_LOCATION}`,
    `🗺️ แผนที่: ${mapUrl}`,
    "⚠️ หากข้อมูลพื้นที่ไม่ตรง กรุณาแจ้งกลับเพื่อแก้ไข",
    "",
    "🔎 ติดตามข้อมูลการดับไฟ",
    `📅 แผนดับไฟ: ${OUTAGE_CALENDAR_URL}`,
    "",
    "ขอบคุณครับ 🙏"
  ].join("\n");
}
