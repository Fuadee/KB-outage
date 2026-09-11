import type { CalendarStatus } from "./calendarSummary.ts";

export const THAI_CALENDAR_DAY_LABELS = [
  "อา.",
  "จ.",
  "อ.",
  "พ.",
  "พฤ.",
  "ศ.",
  "ส."
] as const;

export const CALENDAR_FLOW_STEPS = [
  "สร้างเอกสาร",
  "รับเอกสาร",
  "ส่งเอกสาร",
  "แจ้งดับไฟ",
  "ประชาสัมพันธ์",
  "ปิดงาน"
] as const;

const CALENDAR_STATUS_LABELS: Record<CalendarStatus, string> = {
  Draft: "เตรียมงาน",
  Doc: "เอกสาร",
  Posted: "ประชาสัมพันธ์แล้ว",
  Notice: "แจ้งดับไฟ",
  Done: "ปิดงานแล้ว"
};

export function getCalendarStatusLabel(status: string): string {
  return status in CALENDAR_STATUS_LABELS
    ? CALENDAR_STATUS_LABELS[status as CalendarStatus]
    : status;
}

export function formatThaiCalendarMonth(date: Date): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    month: "long",
    year: "numeric"
  }).format(date);
}

export function formatThaiCalendarDate(date: Date): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}
