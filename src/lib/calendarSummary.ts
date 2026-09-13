import {
  isResponsibleUnit,
  RESPONSIBLE_UNITS,
  type ResponsibleUnit
} from "./jobMetadata.ts";

export const CALENDAR_STATUS_ORDER = [
  "Draft",
  "Doc",
  "Posted",
  "Notice",
  "Done"
] as const;

export type CalendarStatus = (typeof CALENDAR_STATUS_ORDER)[number];
export type ResponsibleUnitFilter = "all" | ResponsibleUnit;

export type CalendarSummaryEntry = {
  responsible_unit: ResponsibleUnit | null;
  status: CalendarStatus;
  count: number;
  switching_count: number;
  shift_one_distribution_count: number;
};

export type CalendarSummaryItem = {
  date: string;
  total: number;
  switching_count: number;
  shift_one_distribution_count: number;
  entries: CalendarSummaryEntry[];
};

export type CalendarSummaryRecord = {
  date: string;
  responsible_unit: unknown;
  status: CalendarStatus;
  has_switching?: unknown;
  requires_shift_one_distribution?: unknown;
};

const statusRank = new Map(
  CALENDAR_STATUS_ORDER.map((status, index) => [status, index])
);
const unitRank = new Map(
  RESPONSIBLE_UNITS.map((unit, index) => [unit, index])
);

function normalizeResponsibleUnit(value: unknown): ResponsibleUnit | null {
  return isResponsibleUnit(value) ? value : null;
}

function compareEntries(a: CalendarSummaryEntry, b: CalendarSummaryEntry) {
  const statusDifference =
    (statusRank.get(a.status) ?? Number.MAX_SAFE_INTEGER) -
    (statusRank.get(b.status) ?? Number.MAX_SAFE_INTEGER);
  if (statusDifference !== 0) return statusDifference;

  return (
    (a.responsible_unit === null
      ? RESPONSIBLE_UNITS.length
      : unitRank.get(a.responsible_unit) ?? RESPONSIBLE_UNITS.length) -
    (b.responsible_unit === null
      ? RESPONSIBLE_UNITS.length
      : unitRank.get(b.responsible_unit) ?? RESPONSIBLE_UNITS.length)
  );
}

export function buildCalendarSummary(
  records: CalendarSummaryRecord[]
): CalendarSummaryItem[] {
  const byDate = new Map<string, CalendarSummaryItem>();

  records.forEach((record) => {
    const responsibleUnit = normalizeResponsibleUnit(record.responsible_unit);
    const summary = byDate.get(record.date) ?? {
      date: record.date,
      total: 0,
      switching_count: 0,
      shift_one_distribution_count: 0,
      entries: []
    };
    const entry = summary.entries.find(
      (candidate) =>
        candidate.responsible_unit === responsibleUnit &&
        candidate.status === record.status
    );

    summary.total += 1;
    if (record.has_switching === true) {
      summary.switching_count += 1;
    }
    if (record.requires_shift_one_distribution === true) {
      summary.shift_one_distribution_count += 1;
    }
    if (entry) {
      entry.count += 1;
      if (record.has_switching === true) entry.switching_count += 1;
      if (record.requires_shift_one_distribution === true) {
        entry.shift_one_distribution_count += 1;
      }
    } else {
      summary.entries.push({
        responsible_unit: responsibleUnit,
        status: record.status,
        count: 1,
        switching_count: record.has_switching === true ? 1 : 0,
        shift_one_distribution_count:
          record.requires_shift_one_distribution === true ? 1 : 0
      });
    }
    byDate.set(record.date, summary);
  });

  return Array.from(byDate.values())
    .map((summary) => ({
      ...summary,
      entries: [...summary.entries].sort(compareEntries)
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function filterCalendarSummary(
  summary: CalendarSummaryItem[],
  filter: ResponsibleUnitFilter
): CalendarSummaryItem[] {
  if (filter === "all") return summary;

  return summary.flatMap((item) => {
    const entries = item.entries.filter(
      (entry) => entry.responsible_unit === filter
    );
    if (!entries.length) return [];

    return [
      {
        ...item,
        total: entries.reduce((total, entry) => total + entry.count, 0),
        switching_count: entries.reduce(
          (total, entry) => total + entry.switching_count,
          0
        ),
        shift_one_distribution_count: entries.reduce(
          (total, entry) => total + entry.shift_one_distribution_count,
          0
        ),
        entries
      }
    ];
  });
}

export function matchesResponsibleUnitFilter(
  value: unknown,
  filter: ResponsibleUnitFilter
): boolean {
  return filter === "all" || value === filter;
}
