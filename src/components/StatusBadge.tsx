"use client";

import type { ReactElement } from "react";
import type { UrgencyColor } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: UrgencyColor;
  label: string;
  compact?: boolean;
};

const statusTone: Record<UrgencyColor, string> = {
  RED: "border-red-500/50 bg-red-500/10 text-red-300",
  YELLOW: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  GREEN: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
};

export default function StatusBadge({
  status,
  label,
  compact
}: StatusBadgeProps): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        compact ? "px-2 py-0.5 text-[10px]" : "",
        statusTone[status]
      )}
    >
      {label}
    </span>
  );
}
