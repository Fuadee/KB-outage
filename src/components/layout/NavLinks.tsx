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
        "flex items-center gap-1.5",
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
              "group relative inline-flex items-center justify-center rounded-[6px] px-3 py-2 text-[13px] font-medium text-slate-300 transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
              "hover:bg-white/[0.06] hover:text-white",
              stacked && "justify-between px-4 py-2.5 text-base",
              stacked && "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              active && (stacked ? "bg-orange-50 !text-orange-700" : "bg-white/[0.07] text-white")
            )}
          >
            <span>{item.label}</span>
            {active ? (
              <span
                className={cn(
                  stacked
                    ? "ml-2 h-1.5 w-1.5 rounded-full bg-[#f97316]"
                    : "absolute inset-x-3 bottom-0 h-px bg-orange-400/90"
                )}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
