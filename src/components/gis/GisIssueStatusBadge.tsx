import { GIS_STATUS_META, type GisIssueStatus } from "@/lib/gisIssues";
import { cn } from "@/lib/utils";

export default function GisIssueStatusBadge({
  status,
  compact = false
}: {
  status: GisIssueStatus;
  compact?: boolean;
}) {
  const meta = GIS_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        meta.badge,
        compact && "px-2 py-0.5 text-[11px]"
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}
