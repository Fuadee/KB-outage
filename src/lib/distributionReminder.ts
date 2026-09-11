const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DistributionReminderState =
  | "DONE"
  | "UPCOMING"
  | "DUE_TODAY"
  | "OVERDUE"
  | "OUTAGE_DATE_UNKNOWN";

export type DistributionReminderStatus = {
  state: DistributionReminderState;
  dueDate: string | null;
  distributionDate: string | null;
  distributionBy: string | null;
  daysUntilDue: number | null;
  daysOverdue: number | null;
};

function calendarDateInBangkok(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeCalendarDate(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (isValidDateOnly(trimmed)) return trimmed;

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : calendarDateInBangkok(date);
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function calendarDayDifference(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) -
      Date.parse(`${start}T00:00:00Z`)) /
      MS_PER_DAY
  );
}

/**
 * Seven calendar days before the outage, shifted to the following Monday when
 * that date falls on Saturday or Sunday.
 */
export function getDistributionDueDate(
  outageDate?: string | null
): string | null {
  const normalizedOutageDate = normalizeCalendarDate(outageDate);
  if (!normalizedOutageDate) return null;

  const baseDueDate = addCalendarDays(normalizedOutageDate, -7);
  const weekday = new Date(`${baseDueDate}T00:00:00Z`).getUTCDay();

  if (weekday === 6) return addCalendarDays(baseDueDate, 2);
  if (weekday === 0) return addCalendarDays(baseDueDate, 1);
  return baseDueDate;
}

export function getDistributionReminderStatus({
  outageDate,
  noticeDate,
  noticeBy,
  noticeStatus,
  now = new Date()
}: {
  outageDate?: string | null;
  noticeDate?: string | null;
  noticeBy?: string | null;
  noticeStatus?: string | null;
  now?: Date;
}): DistributionReminderStatus {
  const distributionDate = normalizeCalendarDate(noticeDate);
  const distributionBy = noticeBy?.trim() || null;
  const isDone = noticeStatus === "SCHEDULED" || Boolean(distributionDate);
  const dueDate = getDistributionDueDate(outageDate);

  if (isDone) {
    return {
      state: "DONE",
      dueDate,
      distributionDate,
      distributionBy,
      daysUntilDue: null,
      daysOverdue: null
    };
  }

  if (!dueDate) {
    return {
      state: "OUTAGE_DATE_UNKNOWN",
      dueDate: null,
      distributionDate: null,
      distributionBy,
      daysUntilDue: null,
      daysOverdue: null
    };
  }

  const today = calendarDateInBangkok(now);
  const difference = calendarDayDifference(today, dueDate);

  if (difference > 0) {
    return {
      state: "UPCOMING",
      dueDate,
      distributionDate: null,
      distributionBy,
      daysUntilDue: difference,
      daysOverdue: null
    };
  }

  if (difference === 0) {
    return {
      state: "DUE_TODAY",
      dueDate,
      distributionDate: null,
      distributionBy,
      daysUntilDue: 0,
      daysOverdue: null
    };
  }

  return {
    state: "OVERDUE",
    dueDate,
    distributionDate: null,
    distributionBy,
    daysUntilDue: null,
    daysOverdue: Math.abs(difference)
  };
}

