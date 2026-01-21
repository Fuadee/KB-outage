"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Badge from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";

interface TopNavProps {
  onMenuClick: () => void;
}

const titleMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/jobs": "Jobs",
  "/calendar": "Calendar",
  "/job": "Job detail"
};

const getTitle = (pathname: string) => {
  const matched = Object.keys(titleMap).find(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  return matched ? titleMap[matched] : "KB Outage";
};

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
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 lg:hidden"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Current view
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDashboard ? (
            <Link
              href="/jobs"
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              ดูงานทั้งหมด
            </Link>
          ) : null}
          {isJobs ? (
            <Link
              href="/new"
              className={buttonStyles({ variant: "primary", size: "sm" })}
            >
              + สร้างงาน
            </Link>
          ) : null}
          {isCalendar ? (
            <Link
              href="/jobs"
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              ไปที่ Jobs
            </Link>
          ) : null}
          {isJobDetail ? (
            <Link
              href="/jobs"
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              กลับไป Jobs
            </Link>
          ) : null}
          <Badge variant="accent">Premium</Badge>
        </div>
      </div>
    </header>
  );
}
