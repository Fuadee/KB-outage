import Button from "@/components/ui/Button";
import type { EditableTarget } from "./types";

type LargeCustomerDeliveryRowProps = {
  item: EditableTarget;
  index: number;
  onEdit: (item: EditableTarget) => void;
  onDelete: (tempId: string) => void;
  onToggleStatus: (tempId: string) => void;
};

const statusBadgeClass = {
  delivered: "border-emerald-500/60 bg-emerald-500/20 text-emerald-200",
  pending: "border-amber-500/60 bg-amber-500/10 text-amber-200"
};

export default function LargeCustomerDeliveryRow({
  item,
  index,
  onEdit,
  onDelete,
  onToggleStatus
}: LargeCustomerDeliveryRowProps) {
  return (
    <tr className="border-b border-slate-800/70 align-top text-sm text-slate-200 last:border-b-0">
      <td className="px-3 py-3">
        <p className="font-medium text-slate-100">{item.company_name || `รายการ ${index + 1}`}</p>
        {item.note ? <p className="mt-1 text-xs text-slate-400 line-clamp-2">{item.note}</p> : null}
      </td>
      <td className="px-3 py-3 text-slate-300">{item.contact_name?.trim() || "-"}</td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
            item.status === "delivered" ? statusBadgeClass.delivered : statusBadgeClass.pending
          }`}
        >
          {item.status === "delivered" ? "แจ้งแล้ว" : "ยังไม่แจ้ง"}
        </span>
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
