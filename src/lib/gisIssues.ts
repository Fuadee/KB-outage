export const GIS_ISSUE_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "VERIFYING",
  "CLOSED"
] as const;

export type GisIssueStatus = (typeof GIS_ISSUE_STATUSES)[number];

export const GIS_ISSUE_TYPES = [
  { value: "EQUIPMENT_POSITION", label: "ตำแหน่งอุปกรณ์ผิด" },
  { value: "EQUIPMENT_CODE", label: "รหัสอุปกรณ์ผิด" },
  { value: "LINE_ROUTE", label: "แนวสายผิด" },
  { value: "MISSING_FROM_GIS", label: "อุปกรณ์หายจาก GIS" },
  { value: "MISSING_IN_GIS", label: "มีอุปกรณ์จริงแต่ไม่มีใน GIS" },
  { value: "CONNECTIVITY", label: "Connectivity / การเชื่อมต่อผิด" },
  { value: "EQUIPMENT_DETAILS", label: "ข้อมูลรายละเอียดอุปกรณ์ผิด" },
  { value: "OTHER", label: "อื่น ๆ" }
] as const;

export type GisIssueType = (typeof GIS_ISSUE_TYPES)[number]["value"];

export type GisIssue = {
  id: string;
  issue_number: string;
  feeder_code: string;
  equipment_code: string | null;
  issue_type: GisIssueType;
  issue_type_detail: string | null;
  location_text: string | null;
  description: string;
  expected_value: string | null;
  status: GisIssueStatus;
  reporter_id: string | null;
  reporter_name: string;
  assignee_name: string | null;
  found_at: string;
  started_at: string | null;
  resolved_at: string | null;
  verified_at: string | null;
  resolution_note: string | null;
  reference_url: string | null;
  source_job_id: string | null;
  created_at: string;
  updated_at: string;
  source_job?: {
    id: string;
    equipment_code: string;
    outage_date: string;
    doc_area_title: string | null;
  } | null;
};

export type GisIssueActivity = {
  id: string;
  issue_id: string;
  activity_type: "CREATED" | "UPDATED" | "STATUS_CHANGED";
  from_status: GisIssueStatus | null;
  to_status: GisIssueStatus | null;
  message: string;
  actor_name: string;
  created_at: string;
};

export const GIS_STATUS_META: Record<
  GisIssueStatus,
  { label: string; dot: string; badge: string }
> = {
  OPEN: {
    label: "รอแก้ไข",
    dot: "bg-rose-500",
    badge: "border-rose-200 bg-rose-50 text-rose-700"
  },
  IN_PROGRESS: {
    label: "กำลังดำเนินการ",
    dot: "bg-orange-400",
    badge: "border-orange-200 bg-orange-50 text-orange-700"
  },
  VERIFYING: {
    label: "รอตรวจสอบ",
    dot: "bg-blue-400",
    badge: "border-blue-200 bg-blue-50 text-blue-700"
  },
  CLOSED: {
    label: "ปิดแล้ว",
    dot: "bg-emerald-400",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
};

export const getGisIssueTypeLabel = (
  issueType: GisIssueType,
  detail?: string | null
) => {
  if (issueType === "OTHER" && detail?.trim()) return detail.trim();
  return (
    GIS_ISSUE_TYPES.find((item) => item.value === issueType)?.label ?? issueType
  );
};

export const isGisIssueStatus = (value: unknown): value is GisIssueStatus =>
  typeof value === "string" &&
  (GIS_ISSUE_STATUSES as readonly string[]).includes(value);

export const isGisIssueType = (value: unknown): value is GisIssueType =>
  typeof value === "string" &&
  GIS_ISSUE_TYPES.some((item) => item.value === value);

export const getNextGisIssueStatus = (
  status: GisIssueStatus
): GisIssueStatus | null => {
  if (status === "OPEN") return "IN_PROGRESS";
  if (status === "IN_PROGRESS") return "VERIFYING";
  if (status === "VERIFYING") return "CLOSED";
  return null;
};

export const canTransitionGisIssue = (
  current: GisIssueStatus,
  next: GisIssueStatus
) => getNextGisIssueStatus(current) === next || (next === "OPEN" && current !== "OPEN");

export const formatThaiShortDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00+07:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Bangkok"
  });
};

export const formatThaiDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok"
  });
};

export const getBangkokToday = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Bangkok"
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};
