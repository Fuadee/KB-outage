import Button from "@/components/ui/Button";
import type { EditableTarget } from "./types";

type LargeCustomerDeliveryRowProps = {
  item: EditableTarget;
  index: number;
  onEdit: (item: EditableTarget) => void;
  onDelete: (tempId: string) => void;
  onToggleStatus: (tempId: string) => void;
  onPreviewProof: (item: EditableTarget) => void;
};

const statusBadgeClass = {
  deliveredWithProof: "border-emerald-500/60 bg-emerald-500/20 text-emerald-200",
  deliveredWithoutProof: "border-amber-500/60 bg-amber-500/10 text-amber-200",
  pending: "border-slate-500/60 bg-slate-500/10 text-slate-300"
};

const getDeliveryStatusMeta = (item: EditableTarget) => {
  const hasProof = Boolean(item.proof_image_url);
  if (item.status !== "delivered") {
    return {
      label: "ยังไม่แจ้ง",
      badgeClass: statusBadgeClass.pending
    };
  }
  if (!hasProof) {
    return {
      label: "แจ้งแล้ว (ยังไม่มีรูป)",
      badgeClass: statusBadgeClass.deliveredWithoutProof
    };
  }
  return {
    label: "แจ้งแล้วพร้อมรูป",
    badgeClass: statusBadgeClass.deliveredWithProof
  };
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

export default function LargeCustomerDeliveryRow({
  item,
  index,
  onEdit,
  onDelete,
  onToggleStatus,
  onPreviewProof
}: LargeCustomerDeliveryRowProps) {
  const statusMeta = getDeliveryStatusMeta(item);
  const hasProof = Boolean(item.proof_image_url);

  return (
    <tr className="border-b border-slate-800/70 align-top text-sm text-slate-200 last:border-b-0">
      <td className="px-3 py-3">
        <p className="font-medium text-slate-100">{item.company_name || `รายการ ${index + 1}`}</p>
        {item.note ? <p className="mt-1 text-xs text-slate-400 line-clamp-2">{item.note}</p> : null}
      </td>
      <td className="px-3 py-3 text-slate-300">{item.contact_name?.trim() || "-"}</td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusMeta.badgeClass}`}
        >
          {statusMeta.label}
        </span>
        <p className="mt-1 text-xs text-slate-400">เวลาแจ้ง: {formatThaiDateTime(item.delivered_at)}</p>
      </td>
      <td className="px-3 py-3">
        <div className="flex min-w-[220px] flex-col gap-2">
          <span
            className={`inline-flex w-fit rounded-full border px-2 py-1 text-xs font-medium ${
              hasProof
                ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-200"
                : "border-slate-500/60 bg-slate-500/10 text-slate-300"
            }`}
          >
            {hasProof ? "มีรูปหลักฐาน" : "ยังไม่มีรูป"}
          </span>
          {hasProof ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPreviewProof(item)}
                className="overflow-hidden rounded-md border border-slate-600/80 hover:border-orange-400/70"
                aria-label={`ดูรูปหลักฐาน ${item.company_name || `รายการ ${index + 1}`}`}
              >
                <img src={item.proof_image_url as string} alt="รูปหลักฐาน" className="h-10 w-10 object-cover" />
              </button>
              <a
                href={item.proof_image_url as string}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-orange-300 underline underline-offset-2 hover:text-orange-200"
              >
                เปิดแท็บใหม่
              </a>
            </div>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-slate-300">
        {item.map_link ? (
          <a href={item.map_link} target="_blank" rel="noreferrer" className="text-blue-300 underline underline-offset-2">
            เปิดแผนที่
          </a>
        ) : item.latitudeInput || item.longitudeInput ? (
          <span>{`${item.latitudeInput || "-"}, ${item.longitudeInput || "-"}`}</span>
        ) : (
          <span className="text-slate-500">ไม่มีข้อมูล</span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button type="button" size="sm" variant="secondary" className="!w-auto" onClick={() => onEdit(item)}>
            แก้ไข
          </Button>
          <Button type="button" size="sm" variant="ghost" className="!w-auto" onClick={() => onToggleStatus(item.tempId)}>
            {item.status === "delivered" ? "เปลี่ยนเป็นยังไม่แจ้ง" : "บันทึกว่าแจ้งแล้ว"}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="!w-auto text-red-300 hover:bg-red-500/10 hover:text-red-200" onClick={() => onDelete(item.tempId)}>
            ลบ
          </Button>
        </div>
      </td>
    </tr>
  );
}
