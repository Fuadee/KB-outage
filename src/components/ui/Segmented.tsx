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
        "inline-flex items-center rounded-full bg-slate-100/80 p-1 text-sm shadow-inner",
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
              "rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-2",
              isActive
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
