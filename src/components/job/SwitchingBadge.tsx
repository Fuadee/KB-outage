import { Shuffle } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

type SwitchingBadgeProps = {
  compact?: boolean;
  count?: number;
  className?: string;
};

export default function SwitchingBadge({
  compact = false,
  count,
  className
}: SwitchingBadgeProps) {
  const countLabel = typeof count === "number" && count > 1 ? ` ${count}` : "";

  return (
    <Badge
      variant="accent"
      aria-label={`มี Switching${countLabel ? ` ${count} งาน` : ""}`}
      className={cn(
        compact ? "h-5 px-1.5 py-0 text-[10px] leading-none" : "px-2 py-0.5 text-[11px]",
        className
      )}
    >
      {compact ? null : <Shuffle className="h-3 w-3" aria-hidden="true" />}
      {compact ? `SW${countLabel}` : "มี Switching"}
    </Badge>
  );
}
