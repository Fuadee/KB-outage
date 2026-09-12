"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import Segmented from "@/components/ui/Segmented";
import SwitchingBadge from "@/components/job/SwitchingBadge";
import {
  CALENDAR_STATUS_ORDER,
  filterCalendarSummary,
  matchesResponsibleUnitFilter,
  type CalendarStatus,
  type CalendarSummaryEntry,
  type CalendarSummaryItem,
  type ResponsibleUnitFilter
} from "@/lib/calendarSummary";
import {
  getResponsibleUnitShortLabel,
  type ResponsibleUnit
} from "@/lib/jobMetadata";
import {
  CALENDAR_FLOW_STEPS,
  formatThaiCalendarDate,
  formatThaiCalendarMonth,
  getCalendarStatusLabel,
  THAI_CALENDAR_DAY_LABELS
} from "@/lib/calendarPresentation";

const statusStyles: Record<CalendarStatus, { dot: string }> = {
  Draft: { dot: "bg-slate-500" },
  Doc: { dot: "bg-amber-500" },
  Posted: { dot: "bg-sky-500" },
  Notice: { dot: "bg-violet-500" },
  Done: { dot: "bg-emerald-500" }
};

const flowStepStyles = [
  "border-amber-500 bg-amber-500 text-white",
  "border-amber-500 bg-amber-500 text-white",
  "border-amber-500 bg-amber-500 text-white",
  "border-violet-500 bg-violet-500 text-white",
  "border-sky-500 bg-sky-500 text-white",
  "border-emerald-500 bg-emerald-500 text-white"
] as const;

const responsibleUnitChipStyles: Record<ResponsibleUnit, string> = {
  "แผนกปฏิบัติการ": "border-blue-900 bg-blue-900 text-white",
  "แผนกก่อสร้าง": "border-teal-700 bg-teal-700 text-white",
  "กฟส.อ่าวนาง": "border-purple-800 bg-purple-800 text-white"
};

const legacyResponsibleUnitChipStyle =
  "border-slate-500 bg-slate-500 text-white";

const getResponsibleUnitChipStyle = (
  responsibleUnit: ResponsibleUnit | null
) =>
  responsibleUnit
    ? responsibleUnitChipStyles[responsibleUnit]
    : legacyResponsibleUnitChipStyle;

function CalendarSummaryRow({ entry }: { entry: CalendarSummaryEntry }) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 leading-5">
      <span
        className={`inline-flex h-5 max-w-full shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-1.5 text-[11px] font-semibold leading-none ${getResponsibleUnitChipStyle(entry.responsible_unit)}`}
      >
        {getResponsibleUnitShortLabel(entry.responsible_unit)}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-slate-700">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${statusStyles[entry.status].dot}`}
        />
        <span
          className="truncate"
          title={getCalendarStatusLabel(entry.status)}
        >
          {getCalendarStatusLabel(entry.status)}
        </span>
        <span className="shrink-0 font-semibold tabular-nums text-slate-900">
          {entry.count}
        </span>
        {entry.switching_count > 0 ? (
          <SwitchingBadge compact count={entry.switching_count} />
        ) : null}
      </span>
    </div>
  );
}

type DayJob = {
  id: string;
  outage_date: string;
  equipment_code: string | null;
  time_start: string | null;
  time_end: string | null;
  area_title: string | null;
  display_area: string | null;
  status: string;
  responsible_unit: ResponsibleUnit | null;
  has_switching: boolean | null;
};

function MobileSelectedDayJobCard({ job }: { job: DayJob }) {
  const statusKey = CALENDAR_STATUS_ORDER.find(
    (status) => status === job.status
  );
  const statusDotStyle = statusKey
    ? statusStyles[statusKey].dot
    : statusStyles.Draft.dot;

  return (
    <article
      data-mobile-selected-job
      className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className={`inline-flex h-5 shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-1.5 text-[11px] font-semibold leading-none ${getResponsibleUnitChipStyle(job.responsible_unit)}`}
        >
          {getResponsibleUnitShortLabel(job.responsible_unit)}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-700">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${statusDotStyle}`}
          />
          {getCalendarStatusLabel(job.status)}
        </span>
        {job.has_switching === true ? <SwitchingBadge compact /> : null}
      </div>
      <p className="mt-2 break-words text-sm font-semibold leading-5 text-slate-900">
        {job.equipment_code || "ไม่ระบุรหัสอุปกรณ์"}
      </p>
      <p className="mt-0.5 break-words text-sm leading-5 text-slate-600">
        {job.display_area || "ไม่ระบุพื้นที่"}
      </p>
    </article>
  );
}

const responsibleUnitFilters: Array<{
  id: ResponsibleUnitFilter;
  label: string;
}> = [
  { id: "all", label: "ทั้งหมด" },
  { id: "แผนกปฏิบัติการ", label: "ผปบ." },
  { id: "แผนกก่อสร้าง", label: "ผกส." },
  { id: "กฟส.อ่าวนาง", label: "อ่าวนาง" }
];

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);
const addDays = (date: Date, amount: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
};
const startOfWeek = (date: Date) => addDays(date, -date.getDay());
const endOfWeek = (date: Date) => addDays(date, 6 - date.getDay());
const isSameMonth = (date: Date, reference: Date) =>
  date.getFullYear() === reference.getFullYear() &&
  date.getMonth() === reference.getMonth();
const isSameDate = (date: Date, reference: Date) =>
  date.getFullYear() === reference.getFullYear() &&
  date.getMonth() === reference.getMonth() &&
  date.getDate() === reference.getDate();

const formatTimeRange = (start: string | null, end: string | null) => {
  if (!start && !end) return "ไม่ระบุเวลา";
  if (start && end) return `${start} - ${end}`;
  return start ? `${start} -` : `- ${end}`;
};

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [summary, setSummary] = useState<CalendarSummaryItem[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [responsibleUnitFilter, setResponsibleUnitFilter] =
    useState<ResponsibleUnitFilter>("all");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dayJobs, setDayJobs] = useState<DayJob[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [dayRequestRevision, setDayRequestRevision] = useState(0);

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);
  const gridStart = useMemo(() => startOfWeek(monthStart), [monthStart]);
  const gridEnd = useMemo(() => endOfWeek(monthEnd), [monthEnd]);

  const daysInGrid = useMemo(() => {
    const days: Date[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [gridStart, gridEnd]);

  const filteredSummary = useMemo(
    () => filterCalendarSummary(summary, responsibleUnitFilter),
    [summary, responsibleUnitFilter]
  );

  const summaryByDate = useMemo(() => {
    const map = new Map<string, CalendarSummaryItem>();
    filteredSummary.forEach((item) => {
      map.set(item.date, item);
    });
    return map;
  }, [filteredSummary]);

  const visibleDayJobs = useMemo(
    () =>
      dayJobs.filter((job) =>
        matchesResponsibleUnitFilter(
          job.responsible_unit,
          responsibleUnitFilter
        )
      ),
    [dayJobs, responsibleUnitFilter]
  );

  const monthLabel = useMemo(() => {
    return formatThaiCalendarMonth(currentMonth);
  }, [currentMonth]);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoadingSummary(true);
      setSummaryError(null);
      const from = formatDateKey(gridStart);
      const to = formatDateKey(gridEnd);

      try {
        const response = await fetch(
          `/api/jobs/calendar?from=${from}&to=${to}`
        );
        if (!response.ok) {
          throw new Error("โหลดข้อมูลไม่สำเร็จ");
        }
        const data = (await response.json()) as CalendarSummaryItem[];
        setSummary(data);
      } catch (error) {
        setSummaryError(
          error instanceof Error
            ? error.message
            : "โหลดข้อมูลไม่สำเร็จ"
        );
        setSummary([]);
      } finally {
        setLoadingSummary(false);
      }
    };

    fetchSummary();
  }, [gridStart, gridEnd]);

  useEffect(() => {
    if (!selectedDate || dayRequestRevision === 0) return;
    const fetchDayJobs = async () => {
      setDayLoading(true);
      setDayError(null);
      const dateKey = formatDateKey(selectedDate);

      try {
        const response = await fetch(`/api/jobs?date=${dateKey}`);
        if (!response.ok) {
          throw new Error("โหลดรายการไม่สำเร็จ");
        }
        const data = (await response.json()) as DayJob[];
        setDayJobs(data);
      } catch (error) {
        setDayError(
          error instanceof Error
            ? error.message
            : "โหลดรายการไม่สำเร็จ"
        );
        setDayJobs([]);
      } finally {
        setDayLoading(false);
      }
    };

    fetchDayJobs();
  }, [dayRequestRevision, selectedDate]);

  const handlePreviousMonth = () => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    );
    setSelectedDate(null);
    setDrawerOpen(false);
  };

  const handleNextMonth = () => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    );
    setSelectedDate(null);
    setDrawerOpen(false);
  };

  const handleToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(null);
    setDrawerOpen(false);
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setDayRequestRevision((revision) => revision + 1);
    setDrawerOpen(true);
  };

  const handleMobileDayClick = (date: Date) => {
    setDayJobs([]);
    setDayError(null);
    setDayLoading(true);
    setSelectedDate(date);
    setDayRequestRevision((revision) => revision + 1);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDayJobs([]);
    setDayError(null);
  };

  const selectedDateIsToday = selectedDate
    ? isSameDate(selectedDate, new Date())
    : false;

  return (
    <div className="min-w-0 max-w-full space-y-3 overflow-hidden">
      <Card className="!border-0 !bg-transparent !shadow-none">
        <CardContent className="grid gap-3 !px-0 py-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <h1 className="page-title">ปฏิทินงานดับไฟ</h1>
            <p className="mt-0.5 text-lg font-semibold text-slate-700">
              {monthLabel}
            </p>
          </div>
          <div className="grid min-w-0 max-w-full gap-2 md:flex md:items-center md:justify-end">
            <Segmented
              options={responsibleUnitFilters}
              value={responsibleUnitFilter}
              onChange={setResponsibleUnitFilter}
              className="w-full max-w-full md:w-auto md:max-w-[22rem]"
            />
            <div className="grid w-full grid-cols-3 gap-2 md:flex md:w-auto md:items-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handlePreviousMonth}
                className="min-h-10 w-full md:min-h-0 md:w-auto"
              >
                ก่อนหน้า
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleToday}
                className="min-h-10 w-full md:min-h-0 md:w-auto"
              >
                วันนี้
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleNextMonth}
                className="min-h-10 w-full md:min-h-0 md:w-auto"
              >
                ถัดไป
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section
        aria-label="ลำดับการดำเนินงาน"
        className="min-h-12 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 md:flex md:flex-wrap md:items-center md:gap-x-3 md:gap-y-1.5"
      >
        <h2 className="mb-1.5 shrink-0 text-xs font-semibold text-slate-800 md:mb-0">
          ขั้นตอนงาน
        </h2>
        <ol className="grid min-w-0 flex-1 grid-cols-3 gap-x-1 gap-y-2 md:flex md:flex-wrap md:items-center md:gap-x-2 md:gap-y-1.5">
          {CALENDAR_FLOW_STEPS.map((step, index) => (
            <li
              key={step}
              className="inline-flex min-w-0 items-center gap-1 text-[11px] font-medium text-slate-700 md:shrink-0 md:gap-1.5 md:text-xs"
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-md border text-[10px] font-bold ${flowStepStyles[index]}`}
              >
                {index + 1}
              </span>
              <span>{step}</span>
              {index < CALENDAR_FLOW_STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`ml-auto text-slate-400 md:ml-0.5 ${index === 2 ? "hidden md:inline" : ""}`}
                >
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <Card
        data-desktop-calendar
        className="hidden min-w-0 max-w-full overflow-hidden border-slate-200/80 shadow-sm lg:block"
      >
        <CardContent className="max-w-full overflow-x-auto !px-3 py-3 sm:!px-4">
          <div className="grid min-w-[960px] grid-cols-7 gap-1.5 text-xs font-semibold tracking-wide text-slate-600 xl:min-w-[1240px]">
            {THAI_CALENDAR_DAY_LABELS.map((label) => (
              <div key={label} className="px-2 py-0.5">
                {label}
              </div>
            ))}
          </div>
          <div className="mt-1.5 grid min-w-[960px] grid-cols-7 gap-1.5 xl:min-w-[1240px]">
            {daysInGrid.map((date) => {
              const dateKey = formatDateKey(date);
              const daySummary = summaryByDate.get(dateKey);
              const visibleEntries = daySummary?.entries.slice(0, 3) ?? [];
              const hiddenJobCount =
                daySummary?.entries
                  .slice(3)
                  .reduce((total, entry) => total + entry.count, 0) ?? 0;
              const isCurrent = isSameMonth(date, currentMonth);
              const isSelected = selectedDate
                ? isSameDate(date, selectedDate)
                : false;
              const isToday = isSameDate(date, new Date());
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              const cellSurface = isToday
                ? "border-orange-400 bg-orange-50/60 ring-1 ring-orange-200"
                : isSelected
                  ? "border-slate-400 bg-slate-50"
                  : !isCurrent
                    ? "border-slate-200/60 bg-slate-50/35"
                    : isWeekend
                      ? "border-slate-200/70 bg-slate-50/70"
                      : "border-slate-200/70 bg-white";

              return (
                <button
                  type="button"
                  key={dateKey}
                  onClick={() => handleDayClick(date)}
                  className={`flex min-h-[112px] flex-col gap-1.5 rounded-lg border px-2.5 py-2 text-left transition hover:border-slate-400 hover:bg-slate-50 ${cellSurface} ${
                    isCurrent ? "" : "text-slate-500"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[15px] font-bold leading-5 ${
                        isToday
                          ? "text-orange-700"
                          : isCurrent
                            ? "text-slate-900"
                            : "text-slate-500"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {isToday ? (
                      <span className="text-[10px] font-semibold text-orange-700">
                        วันนี้
                      </span>
                    ) : null}
                    {/* {daySummary?.total ? (
                      <Badge variant="neutral">{daySummary.total}</Badge>
                    ) : null} */}
                  </div>
                  {loadingSummary ? (
                    <div className="mt-2 h-12 rounded-xl bg-slate-100" />
                  ) : summaryError ? (
                    <p className="text-xs text-rose-500">โหลดไม่สำเร็จ</p>
                  ) : daySummary ? (
                    <div className="min-w-0 space-y-1">
                      {visibleEntries.map((entry) => (
                        <CalendarSummaryRow
                          key={`${dateKey}-${entry.responsible_unit ?? "legacy"}-${entry.status}`}
                          entry={entry}
                        />
                      ))}
                      {hiddenJobCount > 0 ? (
                        <p className="text-[11px] font-medium leading-4 text-slate-500">
                          + อีก {hiddenJobCount} งาน
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div
                      className="min-h-[16px]"
                      title="ไม่มีงาน"
                      aria-label="ไม่มีงาน"
                    >
                      <span className="sr-only">ไม่มีงาน</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div data-mobile-calendar className="space-y-3 lg:hidden">
        <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm">
          <CardContent className="!px-2 py-2.5">
            <div className="grid grid-cols-7 text-center text-[10px] font-semibold tracking-wide text-slate-600">
              {THAI_CALENDAR_DAY_LABELS.map((label) => (
                <div key={`mobile-${label}`} className="py-1">
                  {label}
                </div>
              ))}
            </div>
            <div
              data-mobile-calendar-grid
              className="mt-1 grid grid-cols-7 gap-1"
            >
              {daysInGrid.map((date) => {
                const dateKey = formatDateKey(date);
                const daySummary = summaryByDate.get(dateKey);
                const mobileStatuses = CALENDAR_STATUS_ORDER.filter((status) =>
                  daySummary?.entries.some((entry) => entry.status === status)
                );
                const isCurrent = isSameMonth(date, currentMonth);
                const isSelected = selectedDate
                  ? isSameDate(date, selectedDate)
                  : false;
                const isToday = isSameDate(date, new Date());
                const statusDescription = mobileStatuses
                  .map(getCalendarStatusLabel)
                  .join(", ");
                const hasSwitching = (daySummary?.switching_count ?? 0) > 0;

                return (
                  <button
                    type="button"
                    key={`mobile-${dateKey}`}
                    onClick={() => handleMobileDayClick(date)}
                    aria-label={`วันที่ ${date.getDate()}${daySummary ? ` มี ${daySummary.total} งาน${statusDescription ? `: ${statusDescription}` : ""}${hasSwitching ? `, มี Switching ${daySummary.switching_count} งาน` : ""}` : " ไม่มีงาน"}`}
                    aria-pressed={isSelected}
                    className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center rounded-md border px-0.5 py-1 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                      isToday
                        ? "border-orange-400 bg-orange-50/70 text-orange-800"
                        : isSelected
                          ? "border-slate-700 bg-slate-100 text-slate-950 ring-1 ring-slate-300"
                          : isCurrent
                            ? "border-slate-200 bg-white text-slate-800"
                            : "border-slate-100 bg-slate-50/60 text-slate-400"
                    } ${isToday && isSelected ? "ring-2 ring-orange-300" : ""}`}
                  >
                    <span className="text-xs font-bold leading-4 tabular-nums">
                      {date.getDate()}
                    </span>
                    {loadingSummary ? (
                      <span className="mt-1 h-1.5 w-4 animate-pulse rounded-full bg-slate-200" />
                    ) : daySummary ? (
                      <span className="mt-1 flex min-w-0 items-center justify-center gap-0.5">
                        {mobileStatuses.map((status) => (
                          <span
                            key={`${dateKey}-${status}`}
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusStyles[status].dot}`}
                          />
                        ))}
                        <span className="ml-0.5 text-[9px] font-semibold leading-none tabular-nums text-slate-600">
                          {daySummary.total}
                        </span>
                        {hasSwitching ? (
                          <span className="ml-0.5 text-[8px] font-bold leading-none text-orange-700">
                            SW
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="mt-1 h-1.5" />
                    )}
                  </button>
                );
              })}
            </div>
            {summaryError ? (
              <p className="mt-2 text-center text-xs font-medium text-rose-600">
                โหลดข้อมูลปฏิทินไม่สำเร็จ
              </p>
            ) : null}
          </CardContent>
        </Card>

        <section
          aria-live="polite"
          className={`rounded-lg border px-3 py-3 ${
            selectedDateIsToday
              ? "border-orange-300 bg-orange-50/50"
              : "border-slate-200 bg-white"
          }`}
        >
          {selectedDate ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  งาน{formatThaiCalendarDate(selectedDate)}
                </h2>
                {selectedDateIsToday ? (
                  <span className="shrink-0 text-[10px] font-semibold text-orange-700">
                    วันนี้
                  </span>
                ) : null}
              </div>
              {dayLoading ? (
                <div className="mt-3 h-12 animate-pulse rounded-md bg-slate-100" />
              ) : dayError ? (
                <p className="mt-3 text-xs font-medium text-rose-600">
                  โหลดรายละเอียดไม่สำเร็จ
                </p>
              ) : visibleDayJobs.length ? (
                <div className="mt-3 space-y-2">
                  {visibleDayJobs.map((job) => (
                    <MobileSelectedDayJobCard
                      key={`mobile-detail-${job.id}`}
                      job={job}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  ไม่มีงานในวันนี้
                </p>
              )}
            </>
          ) : (
            <p className="text-center text-sm text-slate-500">
              เลือกวันที่เพื่อดูรายละเอียดงาน
            </p>
          )}
        </section>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 hidden justify-end lg:flex">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeDrawer}
            aria-label="ปิดรายละเอียดงานประจำวัน"
          />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold text-slate-500">
                  งานประจำวัน
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">
                  {selectedDate ? formatThaiCalendarDate(selectedDate) : ""}
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={closeDrawer}
              >
                ปิด
              </Button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {dayLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`skeleton-${index}`}
                      className="h-20 rounded-2xl border border-slate-200 bg-slate-50"
                    />
                  ))}
                </div>
              ) : dayError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                  {dayError}
                </div>
              ) : visibleDayJobs.length ? (
                <div className="space-y-3">
                  {visibleDayJobs.map((job) => {
                    const statusKey = CALENDAR_STATUS_ORDER.find(
                      (status) => status === job.status
                    );
                    const statusDotStyle = statusKey
                      ? statusStyles[statusKey].dot
                      : statusStyles.Draft.dot;

                    return (
                      <Link
                        key={job.id}
                        href={`/job/${job.id}`}
                        className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-4 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {formatTimeRange(job.time_start, job.time_end)}
                          </p>
                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={`inline-flex h-5 shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-1.5 text-[11px] font-semibold leading-none ${getResponsibleUnitChipStyle(job.responsible_unit)}`}
                            >
                              {getResponsibleUnitShortLabel(
                                job.responsible_unit
                              )}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${statusDotStyle}`}
                              />
                              {getCalendarStatusLabel(job.status)}
                            </span>
                            {job.has_switching === true ? (
                              <SwitchingBadge compact />
                            ) : null}
                          </div>
                        </div>
                        <p className="text-sm text-slate-600">
                          {job.area_title ?? "ไม่ระบุพื้นที่"}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  ยังไม่มีงานในวันนี้
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
