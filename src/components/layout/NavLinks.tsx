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
              "group relative inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
              "hover:bg-[#1e293b] hover:text-slate-100",
              stacked && "justify-between px-4 py-2.5 text-base",
              active && "bg-[#1e293b] text-slate-100 ring-1 ring-slate-600"
            )}
          >
            <span>{item.label}</span>
            {active ? (
              <span className="ml-2 h-1.5 w-1.5 rounded-sm bg-[#f97316]" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
