import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

const variantStyles: Record<BadgeVariant, string> = {
  default: "border border-slate-200/80 bg-slate-100/70 text-slate-600",
  accent:
    "border border-fuchsia-200/70 bg-fuchsia-50 text-fuchsia-700",
  success: "border border-emerald-200/80 bg-emerald-50 text-emerald-700",
  warning: "border border-amber-200/80 bg-amber-50 text-amber-700",
  danger: "border border-rose-200/80 bg-rose-50 text-rose-700",
  neutral: "border border-slate-200/70 bg-white text-slate-700"
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export default function Badge({
  variant = "default",
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
        variantStyles[variant],
        className
      )}
    />
  );
}
