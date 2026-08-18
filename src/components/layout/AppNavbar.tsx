"use client";

import Link from "next/link";
import { useState } from "react";
import NavLinks from "@/components/layout/NavLinks";
import MobileNav from "@/components/layout/MobileNav";
import UserMenu from "@/components/layout/UserMenu";
import { brandBadge, topbarBase } from "@/lib/theme";

export default function AppNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className={topbarBase}>
        <div className="mx-auto flex h-full w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className={brandBadge}>
                <div className="flex h-full w-full items-center justify-center rounded bg-[#0f172a] text-xs font-semibold text-slate-100">
                  KB
                </div>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-100">KB Outage Operations</p>
              </div>
            </Link>

            <div className="hidden md:block md:pl-1">
              <NavLinks />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/new"
              className="hidden items-center justify-center rounded-[8px] bg-[var(--primary)] px-3.5 py-2 text-sm font-semibold text-white transition duration-150 ease-out hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--navy)] sm:inline-flex"
            >
              + สร้างงาน
            </Link>
            <UserMenu />
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] border border-white/20 bg-white/10 text-white transition hover:bg-white/15 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              ☰
            </button>
          </div>
        </div>
      </header>
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
