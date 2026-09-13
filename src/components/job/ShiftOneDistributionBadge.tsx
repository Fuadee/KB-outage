import Badge from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

type ShiftOneDistributionBadgeProps = {
  compact?: boolean;
  count?: number;
  className?: string;
};

export default function ShiftOneDistributionBadge({
  compact = false,
  count,
  className
}: ShiftOneDistributionBadgeProps) {
  const countLabel = typeof count === "number" && count > 1 ? ` ${count}` : "";

  return (
    <Badge
      variant="warning"
      aria-label={`กะ 1 ต้องแจกหนังสือ${countLabel ? ` ${count} งาน` : ""}`}
      className={cn(
        compact ? "h-5 px-1.5 py-0 text-[10px] leading-none" : "px-2 py-0.5 text-[11px]",
        className
      )}
    >
      {compact ? `ก1${countLabel}` : "ก1 แจกหนังสือ"}
    </Badge>
  );
}
