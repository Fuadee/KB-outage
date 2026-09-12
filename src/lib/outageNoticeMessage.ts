import { formatCustomerCount } from "./jobMetadata.ts";
import { normalizeGoogleMyMapsViewerUrl } from "./mapUrl.ts";
import {
  getDistributionWorkflow,
  OPERATIONS_DISTRIBUTION_ASSIGNEE
} from "./distributionWorkflow.ts";
import { formatThaiDateBE } from "./reminder.ts";

export const OUTAGE_CALENDAR_URL = "https://kb-outage.vercel.app/calendar";
export const NOTICE_BOOK_PICKUP_LOCATION = "ผปบ. ชั้น 3";
export const NOTICE_ASSIGNMENT_RESPONSIBLE = OPERATIONS_DISTRIBUTION_ASSIGNEE;

export type OutageNoticeMessageJob = {
  outage_date: string;
  responsible_unit?: unknown;
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
  const workflow = getDistributionWorkflow(job);
  const customerCount =
    typeof job.customer_count === "number"
      ? formatCustomerCount(job.customer_count)
      : "ไม่ระบุ";
  const mapUrl =
    normalizeGoogleMyMapsViewerUrl(job.map_link) || "ไม่มีข้อมูลแผนที่";

  const lines = [
    workflow.route === "OPERATIONS"
      ? "📢 แจ้งงานแจกหนังสือดับไฟวันนี้"
      : "📢 แจ้งดำเนินการแจกหนังสือดับไฟ",
    "",
    `📍 พื้นที่: ${getOutageNoticeAreaText(job)}`,
    `📄 จำนวนหนังสือ: ${customerCount} ราย`,
    `👷 ผู้ดำเนินการ: ${workflow.assignmentLabel ?? "ไม่ระบุหน่วยงาน"}`,
    workflow.route === "OPERATIONS"
      ? null
      : `📅 วันดับไฟ: ${formatThaiDateBE(job.outage_date)}`,
    workflow.route === "OPERATIONS"
      ? `📌 รับหนังสือ: ${NOTICE_BOOK_PICKUP_LOCATION}`
      : null,
    `🗺️ แผนที่: ${mapUrl}`,
    "⚠️ หากข้อมูลพื้นที่ไม่ตรง กรุณาแจ้งกลับเพื่อแก้ไข",
    "",
    "🔎 ติดตามข้อมูลการดับไฟ",
    `📅 แผนดับไฟ: ${OUTAGE_CALENDAR_URL}`,
    "",
    "ขอบคุณครับ 🙏"
  ];

  return lines.filter((line): line is string => line !== null).join("\n");
}
