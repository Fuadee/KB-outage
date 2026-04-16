import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  id: T;
  label: string;
};

type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  className
}: SegmentedProps<T>): ReactElement {
  return (
    <div
      role="group"
      className={cn(
        "inline-flex items-center rounded-md border border-slate-600 bg-[#0f172a] p-1 text-sm",
        className
      )}
    >
      {options.map((option) => {
        const isActive = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
              isActive
                ? "bg-[#1e293b] text-slate-100"
                : "text-slate-400 hover:text-slate-100"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
