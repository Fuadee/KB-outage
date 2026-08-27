const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SocialPublicationState = "NOT_YET" | "DUE_TODAY" | "NEXT_ROUND" | "OVERDUE" | "POSTED_VALID" | "POSTED_EARLY" | "POSTED_AFTER_OUTAGE" | "POSTED_DATE_UNKNOWN" | "OUTAGE_DATE_UNKNOWN";
export type SocialPublicationStatus = { state: SocialPublicationState; socialDate: string | null; outageDate: string | null; recommendedSocialDate: string | null; nextPostingDate: string | null; daysUntilOutage: number | null };

function calendarDateInBangkok(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BANGKOK_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateOnly(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : calendarDateInBangkok(date);
}

function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function calendarDayDifference(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / MS_PER_DAY);
}

function isSocialPostingDay(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 1 || weekday === 5;
}

/** The first Monday or Friday in the inclusive seven-day window before the outage. */
export function getRecommendedSocialDate(outageDate: string) {
  const normalizedOutageDate = dateOnly(outageDate);
  if (!normalizedOutageDate) return null;
  const windowStart = addCalendarDays(normalizedOutageDate, -7);
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = addCalendarDays(windowStart, offset);
    if (isSocialPostingDay(candidate)) return candidate;
  }
  return null;
}

function getNextEligiblePostingDate(today: string, outageDate: string) {
  const daysUntilOutage = calendarDayDifference(today, outageDate);
  for (let offset = 0; offset <= daysUntilOutage; offset += 1) {
    const candidate = addCalendarDays(today, offset);
    if (isSocialPostingDay(candidate)) return candidate;
  }
  return null;
}

export function getSocialPublicationStatus({ socialPostedAt, socialStatus, outageDate, now = new Date() }: { socialPostedAt?: string | null; socialStatus?: string | null; outageDate?: string | null; now?: Date }): SocialPublicationStatus {
  const today = calendarDateInBangkok(now);
  const normalizedOutageDate = outageDate ? dateOnly(outageDate) : null;
  const postedAt = socialPostedAt?.trim();
  if (!normalizedOutageDate) return { state: postedAt || socialStatus === "POSTED" ? "POSTED_DATE_UNKNOWN" : "OUTAGE_DATE_UNKNOWN", socialDate: null, outageDate: null, recommendedSocialDate: null, nextPostingDate: null, daysUntilOutage: null };

  const recommendedSocialDate = getRecommendedSocialDate(normalizedOutageDate);
  const daysUntilOutage = calendarDayDifference(today, normalizedOutageDate);
  const socialDate = postedAt ? dateOnly(postedAt) : null;
  if (postedAt || socialStatus === "POSTED") {
    if (!socialDate) return { state: "POSTED_DATE_UNKNOWN", socialDate: null, outageDate: normalizedOutageDate, recommendedSocialDate, nextPostingDate: null, daysUntilOutage };
    const daysBetweenSocialAndOutage = calendarDayDifference(socialDate, normalizedOutageDate);
    return { state: daysBetweenSocialAndOutage < 0 ? "POSTED_AFTER_OUTAGE" : daysBetweenSocialAndOutage > 7 ? "POSTED_EARLY" : "POSTED_VALID", socialDate, outageDate: normalizedOutageDate, recommendedSocialDate, nextPostingDate: null, daysUntilOutage };
  }
  if (!recommendedSocialDate || daysUntilOutage < 0) return { state: "OVERDUE", socialDate: null, outageDate: normalizedOutageDate, recommendedSocialDate, nextPostingDate: null, daysUntilOutage };
  if (today < recommendedSocialDate) return { state: "NOT_YET", socialDate: null, outageDate: normalizedOutageDate, recommendedSocialDate, nextPostingDate: null, daysUntilOutage };
  if (today === recommendedSocialDate) return { state: "DUE_TODAY", socialDate: null, outageDate: normalizedOutageDate, recommendedSocialDate, nextPostingDate: today, daysUntilOutage };
  const nextPostingDate = getNextEligiblePostingDate(today, normalizedOutageDate);
  return { state: nextPostingDate ? "NEXT_ROUND" : "OVERDUE", socialDate: null, outageDate: normalizedOutageDate, recommendedSocialDate, nextPostingDate, daysUntilOutage };
}

export function formatThaiShortDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { timeZone: BANGKOK_TIME_ZONE, weekday: "short", day: "2-digit", month: "short", year: "2-digit" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
