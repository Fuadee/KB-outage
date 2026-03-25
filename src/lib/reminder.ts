export const BANGKOK_TIMEZONE = "Asia/Bangkok";
export const REMINDER_LEAD_DAYS = 5;

const THAI_SHORT_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

export function normalizeDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnly = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return dateOnly;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDaysToDateOnly(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);

  const yyyy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function computeBangkokTodayDateOnly(now?: Date): string {
  return formatDateInTimezone(now ?? new Date(), BANGKOK_TIMEZONE);
}

export function computeTargetOutageDate(options?: {
  now?: Date;
  leadDays?: number;
  timezone?: string;
  overrideDate?: string | null;
}): string {
  const timezone = options?.timezone ?? BANGKOK_TIMEZONE;
  const leadDays = options?.leadDays ?? REMINDER_LEAD_DAYS;
  const now = options?.now ?? new Date();
  const overrideDate = normalizeDateOnly(options?.overrideDate ?? null);

  if (overrideDate) return overrideDate;

  const currentLocalDate = formatDateInTimezone(now, timezone);
  return addDaysToDateOnly(currentLocalDate, leadDays);
}

export function shouldRunAtBangkokEight(date: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BANGKOK_TIMEZONE,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "-1");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "-1");
  return hour === 8 && minute === 0;
}

export function parseTimeHHmm(value: string): { hour: number; minute: number } | null {
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return null;
  }

  const [hourText, minuteText] = trimmed.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return { hour, minute };
}



function computeCurrentTimeInTimezone(date: Date, timezone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? "0"),
  };
}

export function computeLeadPlannedNotifyDate(outageDate: string | null | undefined, leadDays: number): string | null {
  const normalized = normalizeDateOnly(outageDate);
  if (!normalized) return null;
  return addDaysToDateOnly(normalized, -leadDays);
}

export function computeSameDayPlannedNotifyDate(outageDate: string | null | undefined): string | null {
  return normalizeDateOnly(outageDate);
}

export function computeNextScheduledRunAt(options: {
  now?: Date;
  scheduleTime: string;
  timezone?: string;
}): string | null {
  const parsed = parseTimeHHmm(options.scheduleTime);
  if (!parsed) return null;

  const timezone = options.timezone ?? BANGKOK_TIMEZONE;
  const now = options.now ?? new Date();
  const today = formatDateInTimezone(now, timezone);
  const current = computeCurrentTimeInTimezone(now, timezone);

  const isPastOrNow =
    current.hour > parsed.hour ||
    (current.hour === parsed.hour && current.minute >= parsed.minute);

  const runDate = isPastOrNow ? addDaysToDateOnly(today, 1) : today;

  return `${runDate}T${options.scheduleTime}:00+07:00`;
}

export type ReminderReadinessStatus = "disabled" | "scheduled" | "ready_today" | "sent" | "skipped";

export function deriveReminderReadinessStatus(options: {
  enabled: boolean;
  plannedNotifyDate: string | null;
  todayDate: string;
  isSent: boolean;
  skipReason: string | null;
}): ReminderReadinessStatus {
  if (!options.enabled) return "disabled";
  if (options.isSent) return "sent";
  if (options.skipReason) return "skipped";
  if (!options.plannedNotifyDate) return "skipped";
  if (options.plannedNotifyDate === options.todayDate) return "ready_today";
  return "scheduled";
}

export function formatPlannedNotifyThaiDateTime(dateText: string | null, timeText: string | null): string {
  if (!dateText || !timeText) return "-";
  return `${formatThaiDateBE(dateText)} เวลา ${timeText} น.`;
}
export type ReminderEligibilityInput = {
  line_reminder_sent_at?: string | null;
  line_same_day_reminder_sent_at?: string | null;
  outage_date?: string | null;
  status?: string | null;
  is_closed?: boolean | null;
};

function getClosedOrDoneReason(
  job: ReminderEligibilityInput,
  statusFieldExists: boolean
): string | null {
  if (job.is_closed) return "is_closed=true";

  const normalizedStatus = (job.status ?? "").toLowerCase().trim();
  if (statusFieldExists && (normalizedStatus === "closed" || normalizedStatus === "done")) {
    return `status=${normalizedStatus}`;
  }

  return null;
}

export function getReminderSkipReason(
  job: ReminderEligibilityInput,
  targetDate: string,
  statusFieldExists = true
): string | null {
  if (job.line_reminder_sent_at) return "already_sent";

  const closedOrDoneReason = getClosedOrDoneReason(job, statusFieldExists);
  if (closedOrDoneReason) return closedOrDoneReason;

  const normalizedOutageDate = normalizeDateOnly(job.outage_date ?? null);
  if (normalizedOutageDate !== targetDate) return "outage_date_not_match";

  return null;
}

export function getSameDayReminderSkipReason(
  job: ReminderEligibilityInput,
  targetDate: string,
  statusFieldExists = true
): string | null {
  if (job.line_same_day_reminder_sent_at) return "already_sent_same_day";

  const closedOrDoneReason = getClosedOrDoneReason(job, statusFieldExists);
  if (closedOrDoneReason) return closedOrDoneReason;

  const normalizedOutageDate = normalizeDateOnly(job.outage_date ?? null);
  if (normalizedOutageDate !== targetDate) return "outage_date_not_match";

  return null;
}

export function formatThaiDateBE(dateText: string | null | undefined): string {
  if (!dateText) return "-";

  const [y, m, d] = dateText.split("-").map(Number);
  if (!y || !m || !d) return dateText;

  const month = THAI_SHORT_MONTHS[m - 1] ?? "";
  const buddhistYear = y + 543;
  return `${d} ${month} ${buddhistYear}`;
}

export function formatLeadReminderMessage(input: {
  equipmentCode?: string | null;
  outageDate?: string | null;
  leadDays: number;
}): string {
  return `⚡ แจ้งเตือนเตรียมขอดับไฟ\n\nงาน: ${input.equipmentCode ?? "-"}\nวันที่ดับไฟ: ${formatThaiDateBE(input.outageDate)}\n\n⏰ เหลือเวลา ${input.leadDays} วัน\nกรุณาดำเนินการขออนุมัติดับไฟ\nเพื่อเตรียมแจ้งผู้ใช้ไฟฟ้า`;
}

export function formatSameDayReminderMessage(input: {
  equipmentCode?: string | null;
  outageDate?: string | null;
}): string {
  return `⚡ แจ้งเตือนการดับไฟ (วันนี้)\n\nงาน: ${input.equipmentCode ?? "-"}\nวันที่ดับไฟ: ${formatThaiDateBE(input.outageDate)}\n\n📢 กรุณาดำเนินการแจ้งผู้ใช้ไฟฟ้า\nและเตรียมความพร้อมก่อนดำเนินการ`;
}
