import type { Ref } from "react";
import { cn } from "@/lib/utils";
import { getSwitchingLabel } from "@/lib/jobMetadata";

type SwitchingFieldProps = {
  value: boolean | null;
  onChange: (value: boolean) => void;
  name: string;
  disabled?: boolean;
  invalid?: boolean;
  showValueLabel?: boolean;
  firstOptionRef?: Ref<HTMLInputElement>;
};

const options = [
  { value: false, label: "ไม่มี Switching" },
  { value: true, label: "มี Switching" }
] as const;

export default function SwitchingField({
  value,
  onChange,
  name,
  disabled = false,
  invalid = false,
  showValueLabel = false,
  firstOptionRef
}: SwitchingFieldProps) {
  const helperId = `${name}-helper`;

  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={helperId}
      aria-invalid={invalid || undefined}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <legend className="text-sm font-medium text-slate-700">Switching</legend>
        {showValueLabel ? (
          <span className="text-xs font-normal text-slate-500">
            Switching: {getSwitchingLabel(value)}
          </span>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option, index) => {
          const selected = value === option.value;
          return (
            <label
              key={String(option.value)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition",
                selected
                  ? "border-orange-300 bg-orange-50 text-orange-900 ring-1 ring-orange-100"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                disabled && "cursor-not-allowed bg-slate-50 text-slate-500 opacity-80",
                invalid && !selected && "border-rose-300"
              )}
            >
              <input
                ref={index === 0 ? firstOptionRef : undefined}
                type="radio"
                name={name}
                value={String(option.value)}
                checked={selected}
                onChange={() => onChange(option.value)}
                disabled={disabled}
                className="h-4 w-4 shrink-0 accent-orange-600"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      <span id={helperId} className="text-xs font-normal text-slate-500">
        {value === null && showValueLabel
          ? "ข้อมูลเดิมยังไม่ได้ระบุ สามารถเลือกค่าเมื่อแก้ไขงาน"
          : "ระบุว่างานนี้ต้องมี Switching Order หรือไม่"}
      </span>
    </fieldset>
  );
}
