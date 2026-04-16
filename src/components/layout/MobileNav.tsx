"use client";

import Link from "next/link";
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
          "absolute inset-0 bg-slate-950/65 transition-opacity",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "absolute right-3 top-3 w-[calc(100%-1.5rem)] max-w-sm rounded-xl border border-slate-600 bg-[#0f172a] p-4 shadow-2xl transition duration-200",
          open ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-100">เมนูหลัก</p>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition hover:bg-slate-800 hover:text-slate-100"
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
          className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-[#f97316] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a13]"
        >
          + สร้างงาน
        </Link>

        <div className="mt-4 border-t border-slate-700 pt-4">
          <UserMenu compact onAfterLogout={onClose} />
        </div>
      </aside>
    </div>
  );
}
