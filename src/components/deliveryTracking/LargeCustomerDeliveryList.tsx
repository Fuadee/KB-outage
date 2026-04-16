import Button from "@/components/ui/Button";
import LargeCustomerDeliveryRow from "./LargeCustomerDeliveryRow";
import type { EditableTarget } from "./types";

type LargeCustomerDeliveryListProps = {
  items: EditableTarget[];
  onEdit: (item: EditableTarget) => void;
  onDelete: (tempId: string) => void;
  onToggleStatus: (tempId: string) => void;
};

export default function LargeCustomerDeliveryList({
  items,
  onEdit,
  onDelete,
  onToggleStatus
}: LargeCustomerDeliveryListProps) {
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
                  onToggleStatus={onToggleStatus}
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
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                  item.status === "delivered"
                    ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-200"
                    : "border-amber-500/60 bg-amber-500/10 text-amber-200"
                }`}
              >
                {item.status === "delivered" ? "แจ้งแล้ว" : "ยังไม่แจ้ง"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">ผู้รับผิดชอบ: {item.contact_name?.trim() || "-"}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant="secondary" className="!w-auto" onClick={() => onEdit(item)}>
                แก้ไข
              </Button>
              <Button type="button" size="sm" variant="ghost" className="!w-auto" onClick={() => onToggleStatus(item.tempId)}>
                สลับสถานะ
              </Button>
              <Button type="button" size="sm" variant="ghost" className="!w-auto text-red-300" onClick={() => onDelete(item.tempId)}>
                ลบ
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
