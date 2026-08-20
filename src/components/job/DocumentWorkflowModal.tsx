import { useEffect, useState, type FormEvent } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { OutageJob } from "@/lib/jobsRepo";
import { inputLight } from "@/lib/theme";

export type DocumentWorkflowModalMode = "receive" | "deliver";

type Props = {
  job: OutageJob | null;
  mode: DocumentWorkflowModalMode;
  open: boolean;
  onClose: () => void;
  onJobUpdate: (patch: Partial<OutageJob>) => void;
};

function toDateTimeLocal(value?: string | null): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function DocumentWorkflowModal({
  job,
  mode,
  open,
  onClose,
  onJobUpdate
}: Props) {
  const existingAt =
    mode === "receive" ? job?.document_received_at : job?.document_delivered_at;
  const existingBy =
    mode === "receive" ? job?.document_received_by : job?.document_delivered_by;
  const [occurredAt, setOccurredAt] = useState("");
  const [operator, setOperator] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOccurredAt(toDateTimeLocal(existingAt));
    setOperator(existingBy ?? "");
    setNote(mode === "deliver" ? job?.document_delivery_note ?? "" : "");
    setError(null);
  }, [existingAt, existingBy, job?.document_delivery_note, mode, open]);

  const update = async (body: Record<string, unknown>) => {
    if (!job) return false;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${job.id}/document-workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "ไม่สามารถบันทึกข้อมูลได้");
      }
      onJobUpdate(result.job ?? {});
      return true;
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "ไม่สามารถบันทึกข้อมูลได้"
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!occurredAt || !operator.trim()) {
      setError("กรุณาระบุวันเวลาและชื่อผู้ดำเนินการ");
      return;
    }
    const localDate = new Date(occurredAt);
    if (Number.isNaN(localDate.getTime())) {
      setError("รูปแบบวันเวลาไม่ถูกต้อง");
      return;
    }
    const ok = await update({
      action: mode,
      occurred_at: localDate.toISOString(),
      operator: operator.trim(),
      ...(mode === "deliver" ? { note: note.trim() } : {})
    });
    if (ok) onClose();
  };

  const handleClear = async () => {
    const message =
      mode === "receive"
        ? "ยกเลิกสถานะรับเอกสาร? ข้อมูลการส่งเอกสารจะถูกยกเลิกด้วย"
        : "ยกเลิกสถานะส่งเอกสาร?";
    if (!window.confirm(message)) return;
    const ok = await update({
      action: mode === "receive" ? "clear-receipt" : "clear-delivery"
    });
    if (ok) onClose();
  };

  return (
    <Modal
      isOpen={open}
      title={
        mode === "receive"
          ? existingAt
            ? "แก้ไขข้อมูลการรับเอกสาร"
            : "รับเอกสารแล้ว"
          : existingAt
            ? "แก้ไขข้อมูลการส่งเอกสาร"
            : "บันทึกการส่งเอกสาร"
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      panelClassName="max-w-xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {existingAt ? (
              <Button
                type="button"
                variant="ghost"
                className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                disabled={saving}
                onClick={() => void handleClear()}
              >
                ยกเลิกสถานะนี้
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          วันที่และเวลา{mode === "receive" ? "รับเอกสาร" : "ส่งเอกสาร"}
          <Input
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          {mode === "receive" ? "ผู้รับเอกสาร" : "ผู้นำเอกสารไปส่ง"}
          <Input
            type="text"
            value={operator}
            maxLength={200}
            onChange={(event) => setOperator(event.target.value)}
            placeholder="ชื่อผู้ดำเนินการ"
            required
          />
        </label>
        {mode === "deliver" ? (
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            หมายเหตุ <span className="font-normal text-slate-500">(ไม่บังคับ)</span>
            <textarea
              value={note}
              maxLength={1000}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
              className={`${inputLight} min-h-[84px]`}
            />
          </label>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

