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
  RED: "border-red-200 bg-red-50 text-red-700",
  YELLOW: "border-amber-200 bg-amber-50 text-amber-700",
  GREEN: "border-emerald-200 bg-emerald-50 text-emerald-700"
};

export default function StatusBadge({
  status,
  label,
  compact
}: StatusBadgeProps): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        compact ? "px-2 py-0.5 text-[10px]" : "",
        statusTone[status]
      )}
    >
      {label}
    </span>
  );
}
