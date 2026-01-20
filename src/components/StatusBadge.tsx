"use client";

import type { ReactElement } from "react";
import type { UrgencyColor } from "@/lib/dateUtils";
import { statusBadgeClasses } from "@/lib/ui/classes";

type StatusBadgeProps = {
  status: UrgencyColor;
  label: string;
};

export default function StatusBadge({
  status,
  label
}: StatusBadgeProps): ReactElement {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClasses(
        status
      )}`}
    >
      {label}
    </span>
  );
}
