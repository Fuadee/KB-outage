"use client";

import Link from "next/link";
import Button from "@/components/ui/Button";
import NavLinks from "@/components/layout/NavLinks";
import UserMenu from "@/components/layout/UserMenu";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileNav({ open, onClose }: MobileNavProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 md:hidden",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <div
        className={cn(
          "absolute inset-0 bg-slate-900/45 transition-opacity",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "absolute right-3 top-3 w-[calc(100%-1.5rem)] max-w-sm rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xl transition duration-200",
          open ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">เมนูหลัก</p>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        <NavLinks stacked onNavigate={onClose} />

        <Link
          href="/new"
          onClick={onClose}
          className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#f97316] via-[#ec4899] to-[#4f46e5] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          + สร้างงาน
        </Link>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <UserMenu compact onAfterLogout={onClose} />
        </div>
      </aside>
    </div>
  );
}
