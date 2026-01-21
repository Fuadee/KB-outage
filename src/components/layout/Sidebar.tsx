"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Jobs", href: "/jobs" },
  { label: "Calendar", href: "/calendar" }
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const renderNav = () => (
    <div className="flex h-full flex-col bg-white/80 px-5 py-6 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-fuchsia-500 via-purple-500 to-pink-500 text-sm font-semibold text-white shadow-md">
          KB
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">KB Outage</p>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Operations
          </p>
        </div>
      </div>
      <nav className="mt-8 flex-1 space-y-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            (item.href === "/jobs" && pathname.startsWith("/job/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
              }`}
              onClick={onClose}
            >
              <span>{item.label}</span>
              {isActive ? (
                <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500" />
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 text-xs text-slate-500 shadow-sm">
        Premium console layout • v2
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
          className={`absolute left-0 top-0 h-full w-72 transform bg-white shadow-xl transition-transform ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {renderNav()}
        </aside>
      </div>
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col lg:border-r lg:border-slate-200/70 lg:bg-white/80 lg:backdrop-blur-xl">
        {renderNav()}
      </aside>
    </>
  );
}
