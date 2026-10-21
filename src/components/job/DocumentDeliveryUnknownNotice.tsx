import { TriangleAlert } from "lucide-react";

export default function DocumentDeliveryUnknownNotice({ reason }: { reason?: string | null }) {
  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
      <span className="inline-flex items-center gap-1 font-medium">
        <TriangleAlert className="h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
        ไม่ทราบชื่อผู้ส่ง
      </span>
      {reason ? <p className="mt-1 whitespace-pre-wrap break-words">เหตุผล: {reason}</p> : null}
    </div>
  );
}
