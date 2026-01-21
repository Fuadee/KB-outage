"use client";

import { usePathname } from "next/navigation";

interface TopNavProps {
  onMenuClick: () => void;
}

const titleMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/jobs": "Jobs"
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

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 lg:hidden"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
              Current
            </p>
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs font-medium text-slate-500 sm:flex">
          <span className="rounded-full bg-slate-100 px-2.5 py-1">
            Premium UI
          </span>
        </div>
      </div>
    </header>
  );
}
