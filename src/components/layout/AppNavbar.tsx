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
        <div className="mx-auto flex h-full w-full max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className={brandBadge}>
                <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-900">
                  KB
                </div>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-900">KB Outage Operations</p>
              </div>
            </Link>

            <div className="hidden md:block md:pl-2">
              <NavLinks />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/new"
              className="hidden items-center justify-center rounded-full bg-gradient-to-r from-[#f97316] via-[#ec4899] to-[#4f46e5] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 sm:inline-flex"
            >
              + สร้างงาน
            </Link>
            <UserMenu />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 md:hidden"
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
