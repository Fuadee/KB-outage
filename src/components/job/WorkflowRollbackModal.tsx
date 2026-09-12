"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, RotateCcw } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import type { OutageJob } from "@/lib/jobsRepo";
import {
  getAvailableWorkflowRollbackOptions,
  getWorkflowActualStep,
  type WorkflowRollbackTarget
} from "@/lib/workflowRollback";
import { cn } from "@/lib/utils";

type Props = {
  job: OutageJob | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (job: OutageJob) => void;
};

const REASONS = [
  "ลงข้อมูลผิด",
  "ยังไม่ได้ดำเนินการจริง",
  "เปลี่ยนกำหนดการ",
  "อื่น ๆ"
] as const;

const CURRENT_STEP_LABELS: Record<
  ReturnType<typeof getWorkflowActualStep>,
  string
> = {
  DRAFT: "ยังไม่ได้สร้างเอกสาร",
  DOCUMENT_CREATED: "สร้างเอกสารแล้ว",
  DOCUMENT_RECEIVED: "รับเอกสารแล้ว",
  DOCUMENT_SENT: "ส่งเอกสารแล้ว",
  DELIVERY_COMPLETED: "แจกหนังสือแล้ว",
  SOCIAL_POSTED: "ประชาสัมพันธ์แล้ว",
  CLOSED: "ปิดงานแล้ว"
};

export default function WorkflowRollbackModal({
  job,
  open,
  onClose,
  onSuccess
}: Props) {
  const options = useMemo(
    () => (job ? getAvailableWorkflowRollbackOptions(job) : []),
    [job]
  );
  const [target, setTarget] = useState<WorkflowRollbackTarget | null>(null);
  const [reasonChoice, setReasonChoice] = useState<(typeof REASONS)[number]>(
    "ลงข้อมูลผิด"
  );
  const [customReason, setCustomReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = options.find((option) => option.target === target) ?? null;
  const reason =
    reasonChoice === "อื่น ๆ" ? customReason.trim() : reasonChoice;

  const handleReview = () => {
    if (!selected) {
      setError("กรุณาเลือกจุดที่จะย้อน");
      return;
    }
    if (!reason) {
      setError("กรุณาระบุเหตุผลในการย้อนสถานะ");
      return;
    }
    setError(null);
    setConfirming(true);
  };

  const handleConfirm = async () => {
    if (!job || !selected || !reason) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${job.id}/workflow-rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_step: selected.target, reason })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok || !result?.job) {
        throw new Error(result?.error ?? "ย้อน Workflow ไม่สำเร็จ");
      }
      onSuccess(result.job as OutageJob);
      onClose();
    } catch (rollbackError) {
      setError(
        rollbackError instanceof Error
          ? rollbackError.message
          : "ย้อน Workflow ไม่สำเร็จ"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      title="แก้ไข Workflow"
      onClose={saving ? () => undefined : onClose}
      panelClassName="max-w-xl"
      bodyClassName="pb-5"
      footer={
        confirming ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setConfirming(false)}
              className="w-full sm:w-auto"
            >
              กลับไปแก้ไข
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={saving}
              onClick={() => void handleConfirm()}
              className="w-full sm:w-auto"
            >
              {saving ? "กำลังย้อนขั้นตอน..." : "ยืนยันย้อนขั้นตอน"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="w-full sm:w-auto"
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!selected}
              onClick={handleReview}
              className="w-full sm:w-auto"
            >
              ตรวจสอบผลกระทบ
            </Button>
          </div>
        )
      }
    >
      {!job ? null : confirming && selected ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
              <div>
                <h3 className="font-semibold text-rose-900">{selected.label}</h3>
                <p className="mt-1 text-sm leading-6 text-rose-800">
                  ระบบจะยกเลิกสถานะหลังจากจุดนี้พร้อมกัน และบันทึกประวัติการแก้ไข
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900">ข้อมูลที่จะถูกยกเลิกสถานะ</h4>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {selected.clears.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900">ข้อมูลที่จะเก็บไว้</h4>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {selected.keeps.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            เหตุผล: <strong>{reason}</strong>
          </p>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              สถานะปัจจุบัน
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {CURRENT_STEP_LABELS[getWorkflowActualStep(job)]}
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-900">
              เลือกจุดที่จะย้อน
            </legend>
            {options.map((option) => (
              <label
                key={option.target}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
                  target === option.target
                    ? "border-rose-300 bg-rose-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                )}
              >
                <input
                  type="radio"
                  name="rollback-target"
                  value={option.target}
                  checked={target === option.target}
                  onChange={() => setTarget(option.target)}
                  className="mt-1 h-4 w-4 accent-rose-700"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-900">
              เหตุผลในการย้อนสถานะ
            </legend>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setReasonChoice(item)}
                  className={cn(
                    "min-h-9 rounded-lg border px-3 py-1.5 text-sm font-medium",
                    reasonChoice === item
                      ? "border-slate-700 bg-slate-800 text-white"
                      : "border-slate-200 bg-white text-slate-700"
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
            {reasonChoice === "อื่น ๆ" ? (
              <textarea
                value={customReason}
                onChange={(event) => setCustomReason(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="ระบุเหตุผล"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            ) : null}
          </fieldset>

          {options.length === 0 ? (
            <p className="text-sm text-slate-500">สถานะนี้ยังไม่มีขั้นตอนที่ย้อนกลับได้</p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
            <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Job และข้อมูลหลักจะไม่ถูกลบ การแก้ไขจะถูกบันทึกในประวัติ
          </p>
        </div>
      )}
    </Modal>
  );
}
