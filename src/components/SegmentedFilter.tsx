"use client";

import type { ReactElement } from "react";

type Option<T extends string> = {
  id: T;
  label: string;
};

type SegmentedFilterProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export default function SegmentedFilter<T extends string>({
  options,
  value,
  onChange,
  className = ""
}: SegmentedFilterProps<T>): ReactElement {
  return (
    <div
      role="group"
      className={`inline-flex items-center rounded-full bg-slate-100 p-1 text-sm shadow-inner ${
        className ? ` ${className}` : ""
      }`}
    >
      {options.map((option) => {
        const isActive = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 ${
              isActive
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
