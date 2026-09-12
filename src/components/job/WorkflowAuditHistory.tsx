"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";

type WorkflowAudit = {
  id: string;
  from_step: string;
  to_step: string;
  reason: string;
  created_at: string;
};

type Props = {
  jobId: string;
  refreshKey?: number;
};

const STEP_LABELS: Record<string, string> = {
  DRAFT: "ยังไม่สร้างเอกสาร",
  DOCUMENT_CREATED: "สร้างเอกสารแล้ว",
  DOCUMENT_RECEIVED: "รับเอกสารแล้ว",
  DOCUMENT_SENT: "ส่งเอกสารแล้ว",
  DELIVERY_COMPLETED: "แจกหนังสือแล้ว",
  SOCIAL_POSTED: "ประชาสัมพันธ์แล้ว",
  CLOSED: "ปิดงานแล้ว"
};

export default function WorkflowAuditHistory({ jobId, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<WorkflowAudit[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}/workflow-rollback`, {
          cache: "no-store",
          signal: controller.signal
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok) {
          throw new Error(result?.error ?? "โหลดประวัติไม่สำเร็จ");
        }
        setItems(result.history ?? []);
        setError(null);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error ? loadError.message : "โหลดประวัติไม่สำเร็จ"
        );
      }
    };
    void load();
    return () => controller.abort();
  }, [jobId, refreshKey]);

  return (
    <section className="border-t border-slate-200 pt-4">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">ประวัติการแก้ไข Workflow</h3>
      </div>
      {error ? (
        <p className="mt-2 text-xs leading-5 text-rose-700">{error}</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">ยังไม่มีประวัติการย้อนขั้นตอน</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="border-l-2 border-slate-200 pl-3 text-xs leading-5 text-slate-600">
              <p className="font-medium text-slate-800">
                ย้อนจาก “{STEP_LABELS[item.from_step] ?? item.from_step}” เป็น “{STEP_LABELS[item.to_step] ?? item.to_step}”
              </p>
              <p>
                {new Date(item.created_at).toLocaleString("th-TH", {
                  dateStyle: "medium",
                  timeStyle: "short"
                })}
              </p>
              <p>เหตุผล: {item.reason}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

