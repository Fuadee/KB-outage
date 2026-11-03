import Input from "./ui/Input";
import Button from "./ui/Button";
import { formatOutagePeriods, normalizeOutagePeriods, sortOutagePeriods, type OutagePeriod } from "@/lib/outagePeriods";
import type { RefObject } from "react";

export function OutagePeriodsInput({ value, onChange, error, inputRef, disabled }: {
  value: OutagePeriod[]; onChange: (value: OutagePeriod[]) => void;
  error?: string; inputRef?: RefObject<HTMLInputElement>; disabled?: boolean;
}) {
  const exceedsLimit = value.length > 2;
  let summary = "";
  try { summary = formatOutagePeriods({ outage_periods: normalizeOutagePeriods(value) }); }
  catch { /* Show a summary only for complete, valid times. */ }
  return <fieldset className="min-w-0 space-y-3 md:col-span-2" disabled={disabled}
    onBlur={event => {
      if (!exceedsLimit && !event.currentTarget.contains(event.relatedTarget) && value.every(period => period.start_time && period.end_time)) {
        onChange(sortOutagePeriods(value));
      }
    }}>
    <legend className="text-xs font-semibold text-slate-700">กำหนดเวลาดับไฟ</legend>
    {exceedsLimit ? <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
      งานนี้มี {value.length} ช่วงเวลา เกินขีดจำกัด UI ปัจจุบันที่รองรับ 2 ช่วง แสดงข้อมูลเดิมครบทุกช่วงแบบอ่านอย่างเดียว โดยไม่ตัดทิ้งหรือเปลี่ยนแปลงช่วงเวลา
    </p> : null}
    {value.map((period, index) => <div key={index} className={index ? "space-y-2 border-t border-slate-200 pt-3" : "space-y-2"}>
      {value.length > 1 ? <div className="flex items-center justify-between gap-3">
        <span className="whitespace-nowrap text-xs font-semibold text-slate-700">ช่วงที่ {index + 1}</span>
        {index === 1 && !exceedsLimit ? <Button type="button" variant="secondary" className="!w-auto shrink-0 !px-3 !py-1 text-xs"
          onClick={() => onChange(value.slice(0, 1))}>ลบช่วงที่ 2</Button> : null}
      </div> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {(["start_time", "end_time"] as const).map(field => <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
          {field === "start_time" ? "เวลาเริ่มดับไฟ" : "เวลาจ่ายไฟคืน"}
          <Input ref={index === 0 && field === "start_time" ? inputRef : undefined} type="time"
            aria-label={`${field === "start_time" ? "เวลาเริ่มดับไฟ" : "เวลาจ่ายไฟคืน"} ช่วงที่ ${index + 1}`}
            value={period[field]} className="h-10" required readOnly={exceedsLimit}
            onChange={event => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: event.target.value } : item))} />
        </label>)}
      </div>
    </div>)}
    {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
    {value.length === 1 ? <Button type="button" variant="secondary" className="!w-auto !px-3 !py-1.5 text-xs"
      onClick={() => onChange([...value, { start_time: "", end_time: "" }])}>+ เพิ่มช่วงที่ 2</Button> : null}
    {summary ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">สรุปเวลาดับไฟ: {summary}</p> : null}
  </fieldset>;
}
