"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { topbarBase } from "@/lib/theme";

interface TopNavProps {
  onMenuClick: () => void;
}

const titleMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/jobs": "Jobs",
  "/calendar": "Calendar",
  "/settings/reminders": "Reminder Settings",
  "/job": "Job detail"
};

const getTitle = (pathname: string) => {
  const matched = Object.keys(titleMap).find(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  return matched ? titleMap[matched] : "KB Outage";
};

const secondaryBtnClass =
  "inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50";

const primaryBtnClass =
  "inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#f97316] via-[#ec4899] to-[#4f46e5] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110";

export default function TopNav({ onMenuClick }: TopNavProps) {
  const pathname = usePathname();
  const title = getTitle(pathname);
  const isDashboard =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isJobs = pathname === "/jobs" || pathname.startsWith("/jobs/");
  const isCalendar =
    pathname === "/calendar" || pathname.startsWith("/calendar/");
  const isJobDetail = pathname.startsWith("/job/");

  return (
    <header className={topbarBase}>
      <div className="flex h-full items-center justify-between px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 lg:hidden"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Current view
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDashboard ? (
            <Link href="/jobs" className={secondaryBtnClass}>
              ดูงานทั้งหมด
            </Link>
          ) : null}
          {isJobs ? (
            <Link href="/new" className={primaryBtnClass}>
              + สร้างงาน
            </Link>
          ) : null}
          {isCalendar ? (
            <Link href="/jobs" className={secondaryBtnClass}>
              ไปที่ Jobs
            </Link>
          ) : null}
          {isJobDetail ? (
            <Link href="/jobs" className={secondaryBtnClass}>
              กลับไป Jobs
            </Link>
          ) : null}
          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
            Premium
          </span>
        </div>
      </div>
    </header>
  );
}
