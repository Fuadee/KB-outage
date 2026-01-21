"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Jobs", href: "/jobs" }
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const renderNav = () => (
    <div className="flex h-full flex-col bg-white px-4 py-6">
      <div className="flex items-center gap-2 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">
          KB
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">KB Outage</p>
          <p className="text-xs text-slate-500">Operations</p>
        </div>
      </div>
      <nav className="mt-8 flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
              onClick={onClose}
            >
              <span>{item.label}</span>
              {isActive ? (
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
        Premium console layout • v1
      </div>
    </div>
  );

  return (
    <>
      <div
        className={`fixed inset-0 z-40 transition lg:hidden ${
          isOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div
          className={`absolute inset-0 bg-slate-900/40 transition-opacity ${
            isOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={onClose}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-64 transform bg-white shadow-xl transition-transform ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {renderNav()}
        </aside>
      </div>
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white">
        {renderNav()}
      </aside>
    </>
  );
}
