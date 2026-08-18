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
        "inline-flex max-w-full items-center overflow-x-auto rounded-[9px] border border-slate-200/80 bg-slate-100/70 p-0.5 text-sm",
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
              "shrink-0 rounded-[7px] px-3 py-2 text-xs font-medium transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300",
              isActive
                ? "bg-white text-slate-900 ring-1 ring-slate-200"
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
