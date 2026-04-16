"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { appNavItems } from "@/components/layout/navItems";

interface NavLinksProps {
  stacked?: boolean;
  onNavigate?: () => void;
}

const isActiveLink = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export default function NavLinks({ stacked = false, onNavigate }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "flex items-center gap-1",
        stacked && "flex-col items-stretch gap-2"
      )}
      aria-label="Main navigation"
    >
      {appNavItems.map((item) => {
        const active = item.match
          ? item.match(pathname)
          : isActiveLink(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group relative inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70",
              "hover:bg-white hover:text-slate-900",
              stacked && "justify-between rounded-2xl px-4 py-3 text-base",
              active &&
                "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
            )}
          >
            <span>{item.label}</span>
            {active ? (
              <span className="ml-2 h-2 w-2 rounded-full bg-gradient-to-r from-[#f97316] via-[#ec4899] to-[#4f46e5]" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
