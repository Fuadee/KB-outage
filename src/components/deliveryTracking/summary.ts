import type { EditableTarget } from "./types";

export type DeliverySummaryView = {
  total: number;
  delivered: number;
  pending: number;
  progress: number;
};

export function calculateDeliverySummary(items: EditableTarget[]): DeliverySummaryView {
  const total = items.length;
  const delivered = items.filter((item) => item.status === "delivered").length;
  const pending = total - delivered;
  const progress = total > 0 ? Math.round((delivered / total) * 100) : 0;

  return {
    total,
    delivered,
    pending,
    progress
  };
}
