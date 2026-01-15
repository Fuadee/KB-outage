"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listJobs, OutageJob } from "@/lib/jobsRepo";
import {
  daysBetween,
  getStatusColor,
  getStatusLabel,
  parseLocalDate
} from "@/lib/dateUtils";

type FilterOption = "all" | "green" | "yellow" | "red";

export default function DashboardPage() {
  const [jobs, setJobs] = useState<OutageJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await listJobs();
      if (fetchError) {
        setError(fetchError.message);
        setJobs([]);
      } else {
        setJobs(data ?? []);
      }
      setLoading(false);
    };

    fetchJobs();
  }, []);

  const filteredJobs = useMemo(() => {
    const today = new Date();
    const normalizedQuery = query.trim().toLowerCase();
    return jobs
      .filter((job) => {
        if (!normalizedQuery) return true;
        return job.equipment_code.toLowerCase().includes(normalizedQuery);
      })
      .filter((job) => {
        if (filter === "all") return true;
        const daysLeft = daysBetween(today, parseLocalDate(job.outage_date));
        const color = getStatusColor(daysLeft).name;
        return color === filter;
      })
      .sort((a, b) =>
        parseLocalDate(a.outage_date).getTime() -
        parseLocalDate(b.outage_date).getTime()
      );
  }, [jobs, query, filter]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Krabi Outage Tracker</h1>
            <p className="text-sm text-slate-500">
              ติดตามงานดับไฟตามกำหนดและสถานะวันคงเหลือ
            </p>
          </div>
          <Link
            href="/new"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
          >
            + สร้างงาน
          </Link>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full max-w-md flex-col gap-2">
            <label className="text-sm font-medium text-slate-600">
              ค้นหาอุปกรณ์
            </label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="กรอกรหัสอุปกรณ์"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all", label: "ทั้งหมด" },
                { id: "green", label: "เขียว" },
                { id: "yellow", label: "เหลือง" },
                { id: "red", label: "แดง" }
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                onClick={() => setFilter(option.id)}
                className={`rounded-full px-4 py-1 text-sm font-medium transition ${
                  filter === option.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            กำลังโหลดข้อมูล...
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            ยังไม่มีงานที่ตรงกับตัวกรอง
          </div>
        ) : (
          filteredJobs.map((job) => {
            const today = new Date();
            const daysLeft = daysBetween(today, parseLocalDate(job.outage_date));
            const status = getStatusColor(daysLeft);
            const stepBadge =
              job.nakhon_status === "NOTIFIED"
                ? "แจ้งศูนย์นครแล้ว"
                : job.nakhon_status === "NOT_REQUIRED"
                ? "ไม่ต้องแจ้งศูนย์นคร"
                : "รอศูนย์นคร";
            return (
              <div
                key={job.id}
                className="group flex items-stretch overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md"
              >
                <div className={`w-2 ${status.strip}`} />
                <div className="flex w-full flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-500">
                        {parseLocalDate(job.outage_date).toLocaleDateString("th-TH", {
                          year: "numeric",
                          month: "long",
                          day: "numeric"
                        })}
                      </span>
                      <span className={`text-sm font-medium ${status.text}`}>
                        {getStatusLabel(daysLeft)}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${status.badge}`}
                    >
                      {status.name.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {job.equipment_code}
                    </p>
                    <p className="text-sm text-slate-600">
                      {job.note?.trim() || "ไม่มีหมายเหตุ"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {stepBadge}
                    </span>
                    <Link
                      href={`/job/${job.id}`}
                      className="text-sm font-medium text-slate-700 underline-offset-4 transition hover:text-slate-900 hover:underline"
                    >
                      จัดการ
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
