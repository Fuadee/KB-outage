import { Check, Clock3 } from "lucide-react";
import Button from "@/components/ui/Button";
import type { OutageJob } from "@/lib/jobsRepo";
import {
  getDocumentWorkflowStage,
  isDocumentReady,
  isNoticeCompleted,
  isNoticeScheduled,
  isSocialPosted
} from "@/lib/documentWorkflow";
import { cn } from "@/lib/utils";
import { getAvailableWorkflowRollbackOptions } from "@/lib/workflowRollback";
import { getDistributionWorkflow } from "@/lib/distributionWorkflow";

type Props = {
  job: OutageJob;
  onReceive: () => void;
  onDeliver: () => void;
  onNotice: () => void;
  onSocial: () => void;
  onRollback: () => void;
};

function formatDate(value?: string | null): string {
  if (!value) return "ยังไม่ดำเนินการ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export default function DocumentWorkflowPanel({
  job,
  onReceive,
  onDeliver,
  onNotice,
  onSocial,
  onRollback
}: Props) {
  const stage = getDocumentWorkflowStage(job);
  const noticeCompleted = isNoticeCompleted(job);
  const distributionWorkflow = getDistributionWorkflow(job);
  const rollbackAvailable = getAvailableWorkflowRollbackOptions(job).length > 0;
  const items = [
    {
      id: "ready",
      label: "สร้างเอกสาร",
      done: isDocumentReady(job),
      detail: job.doc_generated_at ? formatDate(job.doc_generated_at) : "รอสร้างเอกสาร"
    },
    {
      id: "received",
      label: "รับเอกสาร",
      done: Boolean(job.document_received_at) || noticeCompleted || isSocialPosted(job),
      detail: job.document_received_at
        ? `${formatDate(job.document_received_at)} · ${job.document_received_by ?? "-"}`
        : "รอรับเอกสารฉบับจริง"
    },
    {
      id: "delivered",
      label: "ส่งเอกสาร",
      done: Boolean(job.document_delivered_at) || noticeCompleted || isSocialPosted(job),
      detail: job.document_delivered_at
        ? `${formatDate(job.document_delivered_at)} · ${job.document_delivered_by ?? "-"}`
        : "รอนำเอกสารไปส่ง"
    },
    {
      id: "notice",
      label: "แจกหนังสือ",
      done: noticeCompleted || isSocialPosted(job),
      detail: noticeCompleted
        ? `${formatDate(job.notice_completed_at)} · ${job.notice_by ?? "ไม่ระบุผู้แจกจริง"}`
        : isNoticeScheduled(job) && job.notice_date
          && distributionWorkflow.route === "OPERATIONS"
          ? `กำหนดแจก ${new Date(`${job.notice_date}T00:00:00`).toLocaleDateString("th-TH", { dateStyle: "medium" })} · รอแจก`
          : distributionWorkflow.route === "DIRECT_CONSTRUCTION"
            ? "แผนกก่อสร้างรับผิดชอบแจกเอง"
            : distributionWorkflow.route === "DIRECT_AO_NANG"
              ? "อ่าวนางรับผิดชอบแจกเอง"
              : distributionWorkflow.route === "UNASSIGNED"
                ? "รอระบุหน่วยงานผู้รับผิดชอบ"
                : "รอกำหนดการแจก"
    },
    {
      id: "social",
      label: "Social",
      done: isSocialPosted(job),
      detail: job.social_posted_at ? formatDate(job.social_posted_at) : "รอโพสต์ประชาสัมพันธ์"
    },
    {
      id: "close",
      label: "ปิดงาน",
      done: Boolean(job.is_closed),
      detail: job.is_closed ? "ปิดงานเรียบร้อยแล้ว" : "รอปิดงาน"
    }
  ];

  return (
    <div className="space-y-4">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => {
          const current =
            (item.id === "received" && stage === "WAITING_DOCUMENT") ||
            (item.id === "delivered" && stage === "WAITING_DELIVERY") ||
            (item.id === "notice" && stage === "READY_FOR_NOTICE") ||
            (item.id === "notice" && stage === "NOTICE_SCHEDULED") ||
            (item.id === "social" && stage === "READY_FOR_SOCIAL") ||
            (item.id === "close" && stage === "SOCIAL_POSTED") ||
            (item.id === "ready" && stage === "DRAFT");
          return (
            <li
              key={item.id}
              className={cn(
                "rounded-xl border px-3 py-3",
                current
                  ? "border-orange-200 bg-orange-50/70"
                  : item.done
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-slate-200 bg-slate-50"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border",
                    item.done
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : current
                        ? "border-orange-500 bg-orange-500 text-white"
                        : "border-slate-300 bg-white text-slate-600"
                  )}
                >
                  {item.done ? <Check className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                </span>
                <span className="text-sm font-semibold text-slate-800">{item.label}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{item.detail}</p>
            </li>
          );
        })}
      </ol>

      {job.document_delivery_note ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
          หมายเหตุการส่ง: {job.document_delivery_note}
        </p>
      ) : null}

      {!job.is_closed ? (
        <div className="flex flex-wrap gap-2">
          {stage === "WAITING_DOCUMENT" ? (
            <Button type="button" onClick={onReceive}>รับเอกสารแล้ว</Button>
          ) : null}
          {stage === "WAITING_DELIVERY" ? (
            <Button type="button" onClick={onDeliver}>บันทึกการส่งเอกสาร</Button>
          ) : null}
          {stage === "READY_FOR_NOTICE" ? (
            <Button type="button" onClick={onNotice}>{distributionWorkflow.actionLabel}</Button>
          ) : null}
          {stage === "NOTICE_SCHEDULED" ? (
            <Button type="button" onClick={onNotice}>{distributionWorkflow.actionLabel}</Button>
          ) : null}
          {stage === "READY_FOR_SOCIAL" ? (
            <Button type="button" onClick={onSocial}>Post ลงสื่อ Social</Button>
          ) : null}
          {job.document_received_at ? (
            <Button type="button" variant="secondary" onClick={onReceive}>
              แก้ไขการรับเอกสาร
            </Button>
          ) : null}
          {job.document_delivered_at ? (
            <Button type="button" variant="secondary" onClick={onDeliver}>
              แก้ไขการส่งเอกสาร
            </Button>
          ) : null}
          {isNoticeScheduled(job) ? (
            <Button type="button" variant="secondary" onClick={onNotice}>
              แก้ไขกำหนดการ / ผลการแจก
            </Button>
          ) : null}
        </div>
      ) : null}

      {rollbackAvailable ? (
        <div className="border-t border-slate-200 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">แก้ไข Workflow</p>
              <p className="text-xs leading-5 text-slate-500">
                ใช้เมื่อต้องแก้สถานะที่บันทึกผิด ระบบจะย้อนขั้นตอนหลังจากจุดที่เลือกให้สอดคล้องกัน
              </p>
            </div>
            <Button type="button" variant="danger" size="sm" onClick={onRollback}>
              แก้ไข / ย้อนขั้นตอน
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
