export const BANGKOK_TIMEZONE = "Asia/Bangkok";
export const REMINDER_LEAD_DAYS = 5;

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

  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  return hour === "08" && minute === "00";
}


export type ReminderEligibilityInput = {
  line_reminder_sent_at?: string | null;
  outage_date?: string | null;
  status?: string | null;
  is_closed?: boolean | null;
};

export function getReminderSkipReason(
  job: ReminderEligibilityInput,
  targetDate: string,
  statusFieldExists = true
): string | null {
  if (job.line_reminder_sent_at) return "already_sent";

  if (job.is_closed) return "is_closed=true";

  const normalizedStatus = (job.status ?? "").toLowerCase().trim();
  if (statusFieldExists && (normalizedStatus === "closed" || normalizedStatus === "done")) {
    return `status=${normalizedStatus}`;
  }

  const normalizedOutageDate = normalizeDateOnly(job.outage_date ?? null);
  if (normalizedOutageDate !== targetDate) return "outage_date_not_match";

  return null;
}
