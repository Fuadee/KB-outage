import Button from "@/components/ui/Button";
import type { EditableTarget } from "./types";

type LargeCustomerDeliveryRowProps = {
  item: EditableTarget;
  index: number;
  onEdit: (item: EditableTarget) => void;
  onDelete: (tempId: string) => void;
  onMarkNotified: (tempId: string) => void;
  onPreviewProof: (item: EditableTarget) => void;
};

const statusBadgeClass = {
  deliveredWithProof: "border-green-500/40 bg-green-500/20 text-green-400",
  deliveredWithoutProof: "border-green-500/40 bg-green-500/20 text-green-400",
  pending: "border-red-500/40 bg-red-500/20 text-red-400"
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

const getGoogleMapsUrl = (item: EditableTarget) => {
  if (!item.latitudeInput.trim() || !item.longitudeInput.trim()) return null;
  return `https://www.google.com/maps?q=${item.latitudeInput.trim()},${item.longitudeInput.trim()}`;
};

export default function LargeCustomerDeliveryRow({
  item,
  index,
  onEdit,
  onDelete,
  onMarkNotified,
  onPreviewProof
}: LargeCustomerDeliveryRowProps) {
  const statusMeta = getDeliveryStatusMeta(item);
  const hasProof = Boolean(item.proof_image_url);
  const googleMapsUrl = getGoogleMapsUrl(item);

  return (
    <tr
      className={`align-top text-sm text-gray-300 transition-colors hover:bg-blue-500/10 ${
        index % 2 === 0 ? "bg-[#111827]" : "bg-[#0F172A]"
      }`}
    >
      <td className="px-4 py-4">
        <p className="font-medium text-white">{item.company_name || `รายการ ${index + 1}`}</p>
      </td>
      <td className="px-4 py-4">
        <span
          className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusMeta.badgeClass}`}
        >
          {statusMeta.label}
        </span>
        <p className="mt-1 text-xs text-gray-400">เวลาแจ้ง: {formatThaiDateTime(item.delivered_at)}</p>
      </td>
      <td className="px-4 py-4">
        <div className="flex min-w-[220px] flex-col gap-2">
          <span
            className={`inline-flex w-fit rounded-full border px-2 py-1 text-xs font-medium ${
              hasProof
                ? "border-green-500/40 bg-green-500/20 text-green-400"
                : "border-red-500/40 bg-red-500/20 text-red-400"
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
      <td className="px-4 py-4 text-xs text-gray-300">
        {googleMapsUrl ? (
          <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="text-blue-300 underline underline-offset-2">
            เปิดแผนที่
          </a>
        ) : (
          <span className="text-gray-500">ไม่มีพิกัด</span>
        )}
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="!w-auto rounded-md border border-gray-500 px-3 py-2 text-gray-200 hover:border-gray-300 hover:bg-gray-800/40 hover:text-white"
            onClick={() => onEdit(item)}
          >
            แก้ไข
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="!w-auto rounded-md border border-green-500/60 bg-green-500/20 px-3 py-2 text-green-300 hover:bg-green-500/30 hover:text-green-200"
            onClick={() => onMarkNotified(item.tempId)}
            disabled={item.status === "delivered"}
          >
            {item.status === "delivered" ? "แจ้งแล้ว" : "บันทึกว่าแจ้งแล้ว"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="!w-auto rounded-md border border-red-500/60 bg-red-500/20 px-3 py-2 text-red-300 hover:bg-red-500/30 hover:text-red-200"
            onClick={() => onDelete(item.tempId)}
          >
            ลบ
          </Button>
        </div>
      </td>
    </tr>
  );
}
