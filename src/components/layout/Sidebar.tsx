"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { brandBadge, navItem, navItemActive, sidebarBase } from "@/lib/theme";

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
    <div className={cn("flex h-full flex-col", sidebarBase)}>
      <div className="flex items-center gap-3 px-1">
        <div className={brandBadge}>
          <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-900">
            KB
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">KB Outage</p>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-200/70">
            Operations
          </p>
        </div>
      </div>

      <nav className="mt-8 flex-1 space-y-1.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            (item.href === "/jobs" && pathname.startsWith("/job/"));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(navItem, isActive && navItemActive)}
              onClick={onClose}
            >
              <span>{item.label}</span>
              {isActive ? (
                <span className="h-2 w-2 rounded-full bg-white/80" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-200">
        Premium console layout • v2
      </div>
    </div>
  );

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 transition lg:hidden",
          isOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <div
          className={cn(
            "absolute inset-0 bg-slate-900/40 transition-opacity",
            isOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={onClose}
        />
        <aside
          className={cn(
            "absolute left-4 top-4 h-[calc(100%-2rem)] transform transition-transform",
            isOpen ? "translate-x-0" : "-translate-x-[120%]"
          )}
        >
          {renderNav()}
        </aside>
      </div>

      <aside className="hidden lg:fixed lg:inset-y-4 lg:left-4 lg:flex lg:flex-col">
        {renderNav()}
      </aside>
    </>
  );
}
