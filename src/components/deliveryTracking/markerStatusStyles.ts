import type { DeliveryStatus } from "@/types/deliveryTracking";

export const markerStatusStyles: Record<DeliveryStatus, { color: string; label: string; rowHighlightClass: string }> = {
  delivered: {
    color: "#22c55e",
    label: "แจ้งแล้ว",
    rowHighlightClass: "ring-1 ring-green-400/60 bg-green-500/10"
  },
  pending: {
    color: "#ef4444",
    label: "ยังไม่แจ้ง",
    rowHighlightClass: "ring-1 ring-red-400/60 bg-red-500/10"
  }
};

