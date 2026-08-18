"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import {
  GIS_ISSUE_TYPES,
  getBangkokToday,
  type GisIssue,
  type GisIssueType
} from "@/lib/gisIssues";
import { inputLight } from "@/lib/theme";

export type GisIssueFormValue = {
  feeder_code: string;
  equipment_code: string;
  issue_type: GisIssueType;
  issue_type_detail: string;
  location_text: string;
  description: string;
  expected_value: string;
  assignee_name: string;
  found_at: string;
  reference_url: string;
  source_job_id: string | null;
};

const emptyValue: GisIssueFormValue = {
  feeder_code: "",
  equipment_code: "",
  issue_type: "EQUIPMENT_POSITION",
  issue_type_detail: "",
  location_text: "",
  description: "",
  expected_value: "",
  assignee_name: "",
  found_at: getBangkokToday(),
  reference_url: "",
  source_job_id: null
};

export const issueToFormValue = (issue: GisIssue): GisIssueFormValue => ({
  feeder_code: issue.feeder_code,
  equipment_code: issue.equipment_code ?? "",
  issue_type: issue.issue_type,
  issue_type_detail: issue.issue_type_detail ?? "",
  location_text: issue.location_text ?? "",
  description: issue.description,
  expected_value: issue.expected_value ?? "",
  assignee_name: issue.assignee_name ?? "",
  found_at: issue.found_at,
  reference_url: issue.reference_url ?? "",
  source_job_id: issue.source_job_id
});

export default function GisIssueForm({
  initialValue,
  submitLabel = "บันทึก GIS Issue",
  onSubmit,
  onCancel
}: {
  initialValue?: Partial<GisIssueFormValue>;
  submitLabel?: string;
  onSubmit: (value: GisIssueFormValue) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<GisIssueFormValue>({
    ...emptyValue,
    ...initialValue
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue({ ...emptyValue, ...initialValue });
  }, [initialValue]);

  const set = <K extends keyof GisIssueFormValue>(key: K, next: GisIssueFormValue[K]) =>
    setValue((current) => ({ ...current, [key]: next }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.feeder_code.trim()) return setError("กรุณาระบุ Feeder");
    if (!value.description.trim()) return setError("กรุณาระบุรายละเอียดสิ่งที่ผิด");
    if (value.issue_type === "OTHER" && !value.issue_type_detail.trim()) {
      return setError("กรุณาระบุประเภทปัญหาอื่น ๆ");
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "ไม่สามารถบันทึก GIS Issue ได้"
      );
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-semibold text-slate-700">
          Feeder <span className="text-rose-600">*</span>
          <Input
            value={value.feeder_code}
            onChange={(event) => set("feeder_code", event.target.value)}
            placeholder="เช่น KBB08"
            required
          />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-700">
          รหัสอุปกรณ์
          <Input
            value={value.equipment_code}
            onChange={(event) => set("equipment_code", event.target.value)}
            placeholder="เช่น SW-123"
          />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-700">
          ประเภทปัญหา <span className="text-rose-600">*</span>
          <select
            className={inputLight}
            value={value.issue_type}
            onChange={(event) => set("issue_type", event.target.value as GisIssueType)}
          >
            {GIS_ISSUE_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        {value.issue_type === "OTHER" ? (
          <label className="space-y-1.5 text-xs font-semibold text-slate-700">
            ระบุประเภทปัญหา <span className="text-rose-600">*</span>
            <Input
              value={value.issue_type_detail}
              onChange={(event) => set("issue_type_detail", event.target.value)}
              required
            />
          </label>
        ) : (
          <label className="space-y-1.5 text-xs font-semibold text-slate-700">
            วันที่พบ <span className="text-rose-600">*</span>
            <Input
              type="date"
              value={value.found_at}
              onChange={(event) => set("found_at", event.target.value)}
              required
            />
          </label>
        )}
        <label className="space-y-1.5 text-xs font-semibold text-slate-700 sm:col-span-2">
          จุด/บริเวณที่พบ
          <Input
            value={value.location_text}
            onChange={(event) => set("location_text", event.target.value)}
            placeholder="ตำแหน่งหรือพื้นที่ที่ตรวจพบ"
          />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-700 sm:col-span-2">
          สิ่งที่ผิด / รายละเอียด <span className="text-rose-600">*</span>
          <textarea
            className={`${inputLight} min-h-[92px]`}
            value={value.description}
            onChange={(event) => set("description", event.target.value)}
            placeholder="อธิบายข้อมูล GIS ที่ไม่ถูกต้องให้สั้นและชัดเจน"
            required
          />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-700 sm:col-span-2">
          ข้อมูลที่ควรเป็น
          <textarea
            className={`${inputLight} min-h-[72px]`}
            value={value.expected_value}
            onChange={(event) => set("expected_value", event.target.value)}
            placeholder="ระบุค่าหรือตำแหน่งที่ถูกต้อง"
          />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-700">
          ผู้รับผิดชอบ
          <Input
            value={value.assignee_name}
            onChange={(event) => set("assignee_name", event.target.value)}
            placeholder="ชื่อผู้รับผิดชอบ (ถ้ามี)"
          />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-700">
          URL อ้างอิง
          <Input
            type="url"
            value={value.reference_url}
            onChange={(event) => set("reference_url", event.target.value)}
            placeholder="https://... (ถ้ามี)"
          />
        </label>
        {value.issue_type === "OTHER" ? (
          <label className="space-y-1.5 text-xs font-semibold text-slate-700">
            วันที่พบ <span className="text-rose-600">*</span>
            <Input
              type="date"
              value={value.found_at}
              onChange={(event) => set("found_at", event.target.value)}
              required
            />
          </label>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "กำลังบันทึก..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
