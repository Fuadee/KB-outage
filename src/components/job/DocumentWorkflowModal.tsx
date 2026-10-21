import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import PersonSelect from "@/components/people/PersonSelect";
import type { PersonReference } from "@/lib/people";
import DocumentDeliveryHistory from "@/components/job/DocumentDeliveryHistory";
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
  const [occurredAt, setOccurredAt] = useState(() =>
    toDateTimeLocal(existingAt)
  );
  const [sender, setSender] = useState<PersonReference | null>(() =>
    job?.document_delivered_by_person_id && job.document_delivered_by && job.document_delivered_by_department
      ? {
          id: job.document_delivered_by_person_id,
          full_name: job.document_delivered_by,
          department: job.document_delivered_by_department,
          is_active: true
        }
      : null
  );
  const [senderChanged, setSenderChanged] = useState(false);
  const [senderStatus, setSenderStatus] = useState<"PERSON" | "UNKNOWN">(() =>
    job?.document_delivery_sender_status === "UNKNOWN" ? "UNKNOWN" : "PERSON"
  );
  const [unknownReason, setUnknownReason] = useState(job?.document_delivery_unknown_reason ?? "");
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const preserveLegacySender = Boolean(
    senderStatus === "PERSON" && job?.document_delivery_sender_status !== "UNKNOWN" &&
    existingAt && existingBy && !job?.document_delivered_by_person_id && !senderChanged
  );
  const [note, setNote] = useState(() =>
    mode === "deliver" ? job?.document_delivery_note ?? "" : ""
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const update = async (body: Record<string, unknown>) => {
    if (!job || savingRef.current) return false;
    savingRef.current = true;
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
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "receive") {
      if (await update({ action: "receive" })) onClose();
      return;
    }
    if (!occurredAt || (senderStatus === "PERSON" && !sender && !preserveLegacySender)) {
      setError("กรุณาระบุวันเวลาและเลือกผู้ดำเนินการ");
      return;
    }
    if (mode === "deliver" && senderStatus === "UNKNOWN" && (!unknownReason.trim() || !deliveryConfirmed)) {
      setError("กรุณาระบุเหตุผลที่ไม่ทราบชื่อ และยืนยันว่าเอกสารถูกส่งจริงแล้ว");
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
      sender_status: senderStatus,
      person_id: senderStatus === "PERSON" ? sender?.id ?? null : null,
      preserve_existing_sender: preserveLegacySender,
      ...(senderStatus === "UNKNOWN" ? {
        unknown_reason: unknownReason.trim(), delivery_confirmed: deliveryConfirmed
      } : {}),
      note: note.trim()
    });
    if (ok) onClose();
  };

  return (
    <Modal
      isOpen={open}
      title={
        mode === "receive"
          ? "ยืนยันการรับเอกสาร"
          : existingAt
            ? "แก้ไขข้อมูลการส่งเอกสาร"
            : "บันทึกการส่งเอกสาร"
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      panelClassName={mode === "receive" ? "max-w-[480px]" : "max-w-xl"}
      bodyClassName={mode === "receive" ? "!py-5" : undefined}
      closeButtonIcon={mode === "receive"}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "กำลังบันทึก..." : mode === "receive" ? "ยืนยันรับเอกสาร" : "บันทึก"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        {mode === "receive" ? (
          <div className="space-y-5 text-sm text-slate-700">
            <section className="space-y-2" aria-label="ยืนยันการรับและจัดเก็บเอกสาร">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" />
                <p className="font-semibold leading-6 text-slate-900">ได้รับเอกสารและจัดเข้าแฟ้มงานเรียบร้อยแล้ว</p>
              </div>
              <p className="text-xs leading-5 text-slate-500">กรุณายืนยันหลังจากได้รับเอกสารและจัดเก็บเข้าแฟ้มงานจริงแล้ว</p>
            </section>
            <section className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4" aria-label="ข้อมูลที่จะบันทึก">
              <h3 className="text-xs font-semibold text-slate-500">ข้อมูลที่จะบันทึก</h3>
              <dl className="space-y-3">
                <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3">
                  <dt className="text-slate-500">สถานะ</dt>
                  <dd className="font-medium text-slate-800">รับเอกสารเรียบร้อย</dd>
                </div>
                <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3">
                  <dt className="text-slate-500">วันที่และเวลา</dt>
                  <dd className="text-slate-700">บันทึกเมื่อกดยืนยัน</dd>
                </div>
              </dl>
            </section>
            {existingAt ? (
              <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <p>รับเอกสารแล้วเมื่อ {new Date(existingAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</p>
                {existingBy ? <p>ชื่อผู้รับที่บันทึกไว้เดิม: {existingBy}</p> : null}
                <p>หากยืนยันผิด ให้ใช้ “แก้ไข / ย้อนขั้นตอน”</p>
              </div>
            ) : null}
          </div>
        ) : <>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          วันที่และเวลาส่งเอกสาร
          <Input
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            required
          />
        </label>
        {mode === "deliver" ? (
          <fieldset disabled={saving} className="space-y-2 text-sm text-slate-700">
            <legend className="mb-1.5 font-medium">ข้อมูลผู้ส่งเอกสาร</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="sender-status" value="PERSON" checked={senderStatus === "PERSON"}
                onChange={() => setSenderStatus("PERSON")} />
              เลือกบุคลากร
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="sender-status" value="UNKNOWN" checked={senderStatus === "UNKNOWN"}
                onChange={() => { setSenderStatus("UNKNOWN"); setDeliveryConfirmed(false); }} />
              ไม่ทราบชื่อผู้ส่งเอกสาร
            </label>
          </fieldset>
        ) : null}
        {senderStatus === "PERSON" ? <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          ผู้นำเอกสารไปส่ง
          {(
            <>
              <PersonSelect
                department=""
                includeAllDepartments
                showDepartment
                preferSelectedPerson
                value={sender?.id ?? null}
                selectedPerson={sender}
                legacyName={preserveLegacySender ? existingBy : null}
                onChange={(person) => {
                  setSender(person);
                  setSenderChanged(true);
                }}
                disabled={saving}
                emptyMessage="ไม่พบรายชื่อ กรุณาเพิ่มบุคลากรในหน้า /people"
                searchEmptyMessage="ไม่พบรายชื่อที่ค้นหา กรุณาเพิ่มบุคลากรในหน้า /people"
              />
              {sender?.department ? (
                <span className="text-xs font-normal text-slate-500">
                  สังกัด: {sender.department}
                </span>
              ) : null}
            </>
          )}
        </label> : (
          <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-slate-700">
            <label className="grid gap-1.5 font-medium">
              เหตุผลที่ไม่ทราบชื่อผู้ส่ง
              <textarea required rows={2} maxLength={1000} value={unknownReason}
                disabled={saving} onChange={(event) => setUnknownReason(event.target.value)} className={inputLight} />
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" required checked={deliveryConfirmed} disabled={saving}
                onChange={(event) => setDeliveryConfirmed(event.target.checked)} className="mt-1" />
              ยืนยันว่าเอกสารถูกส่งจริงแล้ว เพียงแต่ไม่ทราบชื่อผู้ส่ง
            </label>
          </div>
        )}
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
        {mode === "deliver" && existingAt && job ? <DocumentDeliveryHistory jobId={job.id} /> : null}
        </>}
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
