import { useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import LargeCustomerDeliveryRow from "./LargeCustomerDeliveryRow";
import type { EditableTarget } from "./types";

type LargeCustomerDeliveryListProps = {
  items: EditableTarget[];
  onEdit: (item: EditableTarget) => void;
  onDelete: (tempId: string) => void;
  onMarkNotified: (tempId: string) => void;
};

export default function LargeCustomerDeliveryList({
  items,
  onEdit,
  onDelete,
  onMarkNotified
}: LargeCustomerDeliveryListProps) {
  const [previewTarget, setPreviewTarget] = useState<EditableTarget | null>(null);

  const getStatusLabel = (item: EditableTarget) => {
    const hasProof = Boolean(item.proof_image_url);
    if (item.status !== "delivered") return "ยังไม่แจ้ง";
    if (!hasProof) return "แจ้งแล้ว (ยังไม่มีรูป)";
    return "แจ้งแล้วพร้อมรูป";
  };

  const getStatusClass = (item: EditableTarget) => {
    const hasProof = Boolean(item.proof_image_url);
    if (item.status !== "delivered") return "border-slate-500/60 bg-slate-500/10 text-slate-300";
    if (!hasProof) return "border-amber-500/60 bg-amber-500/10 text-amber-200";
    return "border-emerald-500/60 bg-emerald-500/20 text-emerald-200";
  };

  const formatThaiDateTime = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  };

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center text-sm text-slate-400">
        ไม่พบรายการที่ตรงเงื่อนไข
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-slate-700 md:block">
        <div className="max-h-[44vh] overflow-auto">
          <table className="min-w-full bg-slate-950/60">
            <thead className="sticky top-0 bg-slate-900/95 text-left text-xs uppercase tracking-wide text-slate-300">
              <tr>
                <th className="px-3 py-2">รายการ</th>
                <th className="px-3 py-2">ผู้รับผิดชอบ</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2">หลักฐาน</th>
                <th className="px-3 py-2">แผนที่</th>
                <th className="px-3 py-2 text-right">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <LargeCustomerDeliveryRow
                  key={item.tempId}
                  item={item}
                  index={index}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onMarkNotified={onMarkNotified}
                  onPreviewProof={setPreviewTarget}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-2 md:hidden">
        {items.map((item, index) => (
          <div key={item.tempId} className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 text-sm text-slate-200">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-slate-100">{item.company_name || `รายการ ${index + 1}`}</p>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusClass(item)}`}
              >
                {getStatusLabel(item)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">ผู้รับผิดชอบ: {item.contact_name?.trim() || "-"}</p>
            <p className="mt-1 text-xs text-slate-400">เวลาแจ้ง: {formatThaiDateTime(item.delivered_at)}</p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                  item.proof_image_url
                    ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-200"
                    : "border-slate-500/60 bg-slate-500/10 text-slate-300"
                }`}
              >
                {item.proof_image_url ? "มีรูปหลักฐาน" : "ยังไม่มีรูป"}
              </span>
              {item.proof_image_url ? (
                <button
                  type="button"
                  onClick={() => setPreviewTarget(item)}
                  className="text-xs font-medium text-orange-300 underline underline-offset-2 hover:text-orange-200"
                >
                  ดูรูป
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant="secondary" className="!w-auto" onClick={() => onEdit(item)}>
                แก้ไข
              </Button>
              <Button type="button" size="sm" variant="ghost" className="!w-auto" onClick={() => onMarkNotified(item.tempId)} disabled={item.status === "delivered"}>
                {item.status === "delivered" ? "แจ้งแล้ว" : "บันทึกว่าแจ้งแล้ว"}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="!w-auto text-red-300" onClick={() => onDelete(item.tempId)}>
                ลบ
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={Boolean(previewTarget?.proof_image_url)}
        title={previewTarget ? `หลักฐานการแจ้ง: ${previewTarget.company_name || "รายการ"}` : "หลักฐานการแจ้ง"}
        onClose={() => setPreviewTarget(null)}
        panelClassName="max-w-3xl"
        bodyClassName="bg-slate-950/60"
      >
        {previewTarget?.proof_image_url ? (
          <div className="space-y-3">
            <img
              src={previewTarget.proof_image_url}
              alt={`รูปหลักฐาน ${previewTarget.company_name || "รายการ"}`}
              className="max-h-[70vh] w-full rounded-xl border border-slate-700 object-contain"
            />
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>รูปที่ 1 จาก 1</span>
              <a
                href={previewTarget.proof_image_url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-orange-300 underline underline-offset-2 hover:text-orange-200"
              >
                เปิดรูปในแท็บใหม่
              </a>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
