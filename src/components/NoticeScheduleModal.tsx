"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { OutageJob } from "@/lib/jobsRepo";
import { normalizeGoogleMyMapsViewerUrl } from "@/lib/mapUrl";
import { buildOutageNoticeLineMessage } from "@/lib/outageNoticeMessage";

const TOAST_TIMEOUT_MS = 2000;

type NoticeScheduleModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: OutageJob | null;
  onJobUpdate?: (jobId: string, patch: Partial<OutageJob>) => void;
};

type NoticeScheduleErrors = {
  noticeDate?: string;
  submit?: string;
};

export default function NoticeScheduleModal({
  open,
  onOpenChange,
  job,
  onJobUpdate
}: NoticeScheduleModalProps) {
  const [noticeDate, setNoticeDate] = useState("");
  const [noticeBy, setNoticeBy] = useState("");
  const [errors, setErrors] = useState<NoticeScheduleErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deliverySummary, setDeliverySummary] = useState<{
    total: number;
    delivered: number;
    pending: number;
    targets: Array<{
      id: string;
      company_name: string;
      status: "pending" | "delivered";
      delivered_at: string | null;
    }>;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setNoticeDate(job?.notice_date ?? "");
    setNoticeBy(job?.notice_by ?? "");
    setErrors({});
    setToastMessage(null);
    setIsSaving(false);
  }, [open, job]);

  const previewText = useMemo(
    () => (job ? buildOutageNoticeLineMessage(job) : ""),
    [job]
  );
  const mapUrl = useMemo(
    () => normalizeGoogleMyMapsViewerUrl(job?.map_link),
    [job?.map_link]
  );
  const missingSourceMessage = useMemo(
    () =>
      [
        typeof job?.customer_count !== "number"
          ? "ยังไม่มีจำนวนผู้ใช้ไฟฟ้า"
          : null,
        !mapUrl ? "ยังไม่มีลิงก์แผนที่ที่ใช้งานได้" : null
      ]
        .filter((message): message is string => Boolean(message))
        .join(" และ"),
    [job?.customer_count, mapUrl]
  );

  const fetchDeliverySummary = useCallback(async () => {
    if (!job) return;
    const response = await fetch(`/api/jobs/${job.id}/delivery-batch`, {
      method: "GET"
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok || !result?.data) {
      setDeliverySummary(null);
      return;
    }

    const targets = result.data.targets ?? [];
    const delivered = targets.filter(
      (target: { status: string }) => target.status === "delivered"
    ).length;

    setDeliverySummary({
      total: targets.length,
      delivered,
      pending: targets.length - delivered,
      targets: targets.map(
        (target: {
          id: string;
          company_name: string;
          status: "pending" | "delivered";
          delivered_at: string | null;
        }) => ({
          id: target.id,
          company_name: target.company_name,
          status: target.status,
          delivered_at: target.delivered_at
        })
      )
    });
  }, [job]);

  useEffect(() => {
    if (!open || !job || job.notice_status !== "SCHEDULED") return;
    console.info("[notice-modal] scheduled job ready for delivery tracking", {
      jobId: job.id,
      noticeStatus: job.notice_status
    });
    fetchDeliverySummary();
  }, [fetchDeliverySummary, job, open]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timeout = window.setTimeout(() => {
      setToastMessage(null);
    }, TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const validateSchedule = () => {
    const nextErrors: NoticeScheduleErrors = {};
    if (!noticeDate) {
      nextErrors.noticeDate = "กรุณาระบุวันที่จะไปดำเนินการแจ้ง";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const persistSchedule = async (): Promise<boolean> => {
    if (!job) return false;

    setIsSaving(true);
    setErrors({});

    try {
      const payload = {
        jobId: job.id,
        notice_date: noticeDate,
        notice_by: noticeBy.trim() || null
      };
      const response = await fetch("/api/jobs/notice-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "ไม่สามารถบันทึกกำหนดการได้");
      }

      const scheduledAt =
        result.notice_scheduled_at ?? new Date().toISOString();

      onJobUpdate?.(job.id, {
        notice_status: "SCHEDULED",
        notice_date: payload.notice_date,
        notice_by: payload.notice_by,
        notice_scheduled_at: scheduledAt
      });

      await fetchDeliverySummary();
      return true;
    } catch (error) {
      console.error("Notice schedule failed", error);
      setErrors({
        submit: "บันทึกกำหนดการไม่สำเร็จ กรุณาลองใหม่"
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const copyPreview = async (): Promise<boolean> => {
    if (!previewText) return false;

    try {
      await navigator.clipboard.writeText(previewText);
      return true;
    } catch (error) {
      console.error("Failed to copy outage notice LINE message", error);
      return false;
    }
  };

  const handleCopy = async () => {
    const copied = await copyPreview();
    if (copied) {
      setToastMessage("คัดลอกข้อความสำหรับ LINE แล้ว");
      return;
    }
    setErrors({ submit: "คัดลอกข้อความไม่สำเร็จ กรุณาลองใหม่" });
  };

  const handleSubmit = async () => {
    if (!validateSchedule()) return;
    const saved = await persistSchedule();
    if (!saved) return;

    const copied = await copyPreview();
    if (copied) {
      setToastMessage("บันทึกกำหนดการและคัดลอกข้อความสำหรับ LINE แล้ว");
      return;
    }
    setErrors({
      submit: "บันทึกกำหนดการแล้ว แต่คัดลอกข้อความไม่สำเร็จ กรุณากดคัดลอกอีกครั้ง"
    });
  };

  return (
    <Modal
      isOpen={open}
      title="กำหนดการแจ้งหนังสือดับไฟ"
      onClose={() => onOpenChange(false)}
      panelClassName="max-w-3xl"
    >
      <div className="flex flex-col gap-4">
        {toastMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {toastMessage}
          </div>
        ) : null}
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          วันที่จะไปดำเนินการแจ้ง
          <Input
            type="date"
            value={noticeDate}
            onChange={(event) => setNoticeDate(event.target.value)}
            required
          />
          {errors.noticeDate ? (
            <span className="text-xs text-red-600">{errors.noticeDate}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          ผู้แจกจริง (บันทึกภายหลัง)
          <Input
            type="text"
            value={noticeBy}
            onChange={(event) => setNoticeBy(event.target.value)}
            placeholder="เช่น พี่บ่าว (ไม่บังคับ)"
          />
          <span className="text-xs font-normal leading-5 text-slate-500">
            ชื่อนี้ใช้บันทึกผู้ที่ไปแจกจริงภายหลัง และไม่ถูกนำไปใส่ข้อความ LINE
          </span>
        </label>
        <section className="space-y-3 border-t border-slate-200 pt-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              ข้อความสำหรับส่ง LINE
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              ข้อความสร้างจากข้อมูลล่าสุดของ Job และจะไม่ถูกบันทึกซ้ำในฐานข้อมูล
            </p>
          </div>
          {missingSourceMessage ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              ข้อมูลยังไม่ครบ: {missingSourceMessage}
            </div>
          ) : null}
          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">
              {previewText || "—"}
            </pre>
          </div>
        </section>
        {errors.submit ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.submit}
          </div>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            ยกเลิก
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleCopy()}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            คัดลอกข้อความ
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            {isSaving ? "กำลังบันทึก..." : "บันทึกและคัดลอกข้อความ"}
          </Button>
        </div>
        {job?.notice_status === "SCHEDULED" ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                สถานะการแจ้งผู้ใช้ไฟรายใหญ่
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (!job) return;
                  const trackingUrl = `/job/${job.id}/major-customers`;
                  console.info("[notice-modal] navigate to major customer tracking page", {
                    jobId: job.id,
                    url: trackingUrl
                  });
                  window.open(trackingUrl, "_blank", "noopener,noreferrer");
                }}
              >
                ติดตามการแจ้งผู้ใช้ไฟฟ้ารายใหญ่
              </Button>
            </div>
            {deliverySummary ? (
              <div className="space-y-2 text-xs text-slate-600">
                <p>
                  ทั้งหมด {deliverySummary.total} ราย | แจ้งแล้ว{" "}
                  {deliverySummary.delivered} ราย | ยังไม่แจ้ง{" "}
                  {deliverySummary.pending} ราย
                </p>
                {deliverySummary.targets.length > 0 ? (
                  <ul className="space-y-1">
                    {deliverySummary.targets.slice(0, 5).map((target) => (
                      <li key={target.id}>
                        - {target.company_name} —{" "}
                        {target.status === "delivered"
                          ? `แจ้งแล้ว ${
                              target.delivered_at
                                ? new Date(target.delivered_at).toLocaleTimeString("th-TH", {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })
                                : ""
                            }`
                          : "ยังไม่แจ้ง"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>ยังไม่มีรายการผู้ใช้ไฟรายใหญ่</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">ยังไม่มีรายการผู้ใช้ไฟรายใหญ่</p>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
