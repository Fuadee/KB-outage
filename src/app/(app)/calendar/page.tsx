"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const statusOrder = ["Draft", "Doc", "Posted", "Notice", "Done"] as const;
const statusStyles: Record<
  (typeof statusOrder)[number],
  { dot: string; badge: string; text: string }
> = {
  Draft: {
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-600",
    text: "text-slate-600"
  },
  Doc: {
    dot: "bg-amber-400",
    badge: "bg-amber-100 text-amber-700",
    text: "text-amber-700"
  },
  Posted: {
    dot: "bg-sky-400",
    badge: "bg-sky-100 text-sky-700",
    text: "text-sky-700"
  },
  Notice: {
    dot: "bg-violet-400",
    badge: "bg-violet-100 text-violet-700",
    text: "text-violet-700"
  },
  Done: {
    dot: "bg-emerald-400",
    badge: "bg-emerald-100 text-emerald-700",
    text: "text-emerald-700"
  }
};

type CalendarSummaryItem = {
  date: string;
  total: number;
  byStatus: Record<string, number>;
};

type DayJob = {
  id: string;
  outage_date: string;
  time_start: string | null;
  time_end: string | null;
  area_title: string | null;
  status: string;
};

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
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dayJobs, setDayJobs] = useState<DayJob[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);

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

  const summaryByDate = useMemo(() => {
    const map = new Map<string, CalendarSummaryItem>();
    summary.forEach((item) => {
      map.set(item.date, item);
    });
    return map;
  }, [summary]);

  const monthLabel = useMemo(() => {
    return currentMonth.toLocaleString("en-US", {
      month: "long",
      year: "numeric"
    });
  }, [currentMonth]);

  const monthlyTotals = useMemo(() => {
    const totals = { total: 0, done: 0, notice: 0, posted: 0 };
    summary.forEach((item) => {
      totals.total += item.total;
      totals.done += item.byStatus.Done ?? 0;
      totals.notice += item.byStatus.Notice ?? 0;
      totals.posted += item.byStatus.Posted ?? 0;
    });
    return totals;
  }, [summary]);

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
    if (!drawerOpen || !selectedDate) return;
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
  }, [drawerOpen, selectedDate]);

  const handlePreviousMonth = () => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    );
  };

  const handleNextMonth = () => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    );
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDayJobs([]);
    setDayError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
          Schedule
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Calendar
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          ภาพรวมปฏิทินงานและการติดตามเอกสารในเดือนนี้
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Month view
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              {monthLabel}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePreviousMonth}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Total outages this month
          </p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">
            {monthlyTotals.total}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            รายการที่ถูกบันทึกไว้ในเดือนนี้
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Posted & notice
          </p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">
            {monthlyTotals.posted + monthlyTotals.notice}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            งานที่มีประกาศหรือโพสต์แล้วในเดือนนี้
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Completed</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">
            {monthlyTotals.done}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            งานที่ปิดสำเร็จแล้ว
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-7 gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {dayLabels.map((label) => (
            <div key={label} className="px-2">
              {label}
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-7 gap-3">
          {daysInGrid.map((date) => {
            const dateKey = formatDateKey(date);
            const daySummary = summaryByDate.get(dateKey);
            const isCurrent = isSameMonth(date, currentMonth);
            const isSelected = selectedDate
              ? isSameDate(date, selectedDate)
              : false;

            return (
              <button
                type="button"
                key={dateKey}
                onClick={() => handleDayClick(date)}
                className={`flex min-h-[120px] flex-col gap-2 rounded-2xl border px-3 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50/60 ${
                  isSelected
                    ? "border-slate-400 bg-slate-50"
                    : "border-slate-200 bg-white"
                } ${isCurrent ? "" : "text-slate-400"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {date.getDate()}
                  </span>
                  {daySummary?.total ? (
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                      {daySummary.total}
                    </span>
                  ) : null}
                </div>
                {loadingSummary ? (
                  <div className="mt-2 h-12 rounded-xl bg-slate-100" />
                ) : summaryError ? (
                  <p className="text-xs text-rose-500">โหลดไม่สำเร็จ</p>
                ) : daySummary ? (
                  <div className="flex flex-wrap gap-2">
                    {statusOrder.map((status) => {
                      const count = daySummary.byStatus[status];
                      if (!count) return null;
                      return (
                        <span
                          key={`${dateKey}-${status}`}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              statusStyles[status].dot
                            }`}
                          />
                          {status} {count}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">ไม่มีงาน</p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeDrawer}
            aria-label="Close calendar drawer"
          />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Daily outages
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  {selectedDate
                    ? selectedDate.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric"
                      })
                    : ""}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                ปิด
              </button>
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
              ) : dayJobs.length ? (
                <div className="space-y-3">
                  {dayJobs.map((job) => {
                    const statusKey = statusOrder.find(
                      (status) => status === job.status
                    );
                    const badgeStyles = statusKey
                      ? statusStyles[statusKey].badge
                      : "bg-slate-100 text-slate-600";

                    return (
                      <Link
                        key={job.id}
                        href={`/job/${job.id}`}
                        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-900">
                            {formatTimeRange(job.time_start, job.time_end)}
                          </p>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeStyles}`}
                          >
                            {job.status}
                          </span>
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
