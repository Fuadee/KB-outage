import type { OutageJob } from "./jobsRepo";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type UrgencyColor = "GREEN" | "YELLOW" | "RED";

export function parseLocalDate(dateString: string) {
  return new Date(`${dateString}T00:00:00`);
}

export function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function daysBetween(start: Date, end: Date) {
  const startDay = startOfDay(start).getTime();
  const endDay = startOfDay(end).getTime();
  return Math.round((endDay - startDay) / MS_PER_DAY);
}

export function getStatusLabel(daysLeft: number) {
  if (daysLeft < 0) {
    return `เลยกำหนด ${Math.abs(daysLeft)} วัน`;
  }
  if (daysLeft === 0) {
    return "วันนี้";
  }
  if (daysLeft === 1) {
    return "พรุ่งนี้";
  }
  return `เหลือ ${daysLeft} วัน`;
}

export function getUrgencyStyles(color: UrgencyColor) {
  if (color === "RED") {
    return {
      strip: "bg-rose-200/80",
      badge: "border border-rose-200/80 bg-rose-50 text-rose-700",
      text: "text-rose-700"
    };
  }
  if (color === "YELLOW") {
    return {
      strip: "bg-amber-200/80",
      badge: "border border-amber-200/80 bg-amber-50 text-amber-700",
      text: "text-amber-700"
    };
  }
  return {
    strip: "bg-emerald-200/80",
    badge: "border border-emerald-200/80 bg-emerald-50 text-emerald-700",
    text: "text-emerald-700"
  };
}

export function getJobUrgency(job: Pick<OutageJob, "outage_date" | "nakhon_status">) {
  const todayStart = startOfDay(new Date());
  const outageDateStart = startOfDay(parseLocalDate(job.outage_date));
  const daysLeft = daysBetween(todayStart, outageDateStart);
  const label = getStatusLabel(daysLeft);

  if (daysLeft < 0) {
    return { daysLeft, color: "RED" as const, label };
  }

  const nakhonStatus = job.nakhon_status ?? "PENDING";

  if (nakhonStatus === "PENDING") {
    if (daysLeft < 14) {
      return { daysLeft, color: "RED" as const, label };
    }
    if (daysLeft <= 28) {
      return { daysLeft, color: "YELLOW" as const, label };
    }
    return { daysLeft, color: "GREEN" as const, label };
  }

  if (daysLeft < 3) {
    return { daysLeft, color: "RED" as const, label };
  }
  if (daysLeft <= 6) {
    return { daysLeft, color: "YELLOW" as const, label };
  }
  return { daysLeft, color: "GREEN" as const, label };
}

/*
Dev-only examples:
- PENDING + 10 days => RED
- NOTIFIED + 10 days => GREEN
- NOTIFIED + 2 days => RED
- NOT_REQUIRED + 5 days => YELLOW
*/
