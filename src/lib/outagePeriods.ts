export type OutagePeriod = { start_time: string; end_time: string };
export type OutagePeriodSource = {
  outage_periods?: OutagePeriod[] | null;
  doc_time_start?: string | null;
  doc_time_end?: string | null;
};

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function sortOutagePeriods(periods: OutagePeriod[]): OutagePeriod[] {
  return periods.map(period => ({ start_time: period.start_time, end_time: period.end_time })).sort((a, b) =>
    (a.start_time || "99:99").localeCompare(b.start_time || "99:99"));
}

/** New arrays are authoritative. Only null/absent arrays fall back to legacy data. */
export function getOutagePeriods(source: OutagePeriodSource): OutagePeriod[] {
  if (source.outage_periods != null) return sortOutagePeriods(source.outage_periods);
  if (!source.doc_time_start && !source.doc_time_end) return [];
  return [{ start_time: source.doc_time_start ?? "", end_time: source.doc_time_end ?? "" }];
}

export function normalizeOutagePeriods(value: unknown): OutagePeriod[] {
  if (!Array.isArray(value) || !value.length) throw new Error("กรุณาระบุช่วงเวลาดับไฟอย่างน้อย 1 ช่วง");
  const periods = value.map((period, index) => {
    if (!period || typeof period !== "object" || typeof period.start_time !== "string" ||
        typeof period.end_time !== "string" || !TIME.test(period.start_time) || !TIME.test(period.end_time)) {
      throw new Error(`ช่วงที่ ${index + 1}: กรุณาระบุเวลาในรูปแบบ HH:mm ให้ครบถ้วน`);
    }
    if (period.start_time >= period.end_time) {
      throw new Error(`ช่วงที่ ${index + 1}: เวลาเริ่มต้องน้อยกว่าเวลาสิ้นสุด ไม่รองรับช่วงเวลาข้ามเที่ยงคืน`);
    }
    return { start_time: period.start_time, end_time: period.end_time };
  });
  const sorted = sortOutagePeriods(periods);
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index].start_time < sorted[index - 1].end_time) throw new Error("ช่วงเวลาดับไฟซ้อนทับกัน กรุณาแก้ไขก่อนบันทึก");
  }
  return sorted;
}

export function formatOutagePeriods(source: OutagePeriodSource): string {
  const ranges = getOutagePeriods(source).map(period =>
    `${period.start_time.replace(":", ".")}–${period.end_time.replace(":", ".")} น.`);
  if (ranges.length < 2) return ranges[0] ?? "";
  return `${ranges.slice(0, -1).join(", ")} และ ${ranges[ranges.length - 1]}`;
}

export function formatThaiOutageDate(value: string, weekday = false): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "";
  const parts = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    timeZone: "UTC", day: "numeric", month: "long", year: "numeric",
    ...(weekday ? { weekday: "long" as const } : {})
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${weekday ? `${part("weekday")}ที่ ` : ""}${part("day")} ${part("month")} ${part("year")}`;
}
