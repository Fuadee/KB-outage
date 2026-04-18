"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { OutageJob } from "@/lib/jobsRepo";

const TOAST_TIMEOUT_MS = 2000;

type NoticeScheduleModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: OutageJob | null;
  onJobUpdate?: (jobId: string, patch: Partial<OutageJob>) => void;
};

export default function NoticeScheduleModal({
  open,
  onOpenChange,
  job,
  onJobUpdate
}: NoticeScheduleModalProps) {
  const [noticeDate, setNoticeDate] = useState("");
  const [noticeBy, setNoticeBy] = useState("");
  const [mymapsUrl, setMymapsUrl] = useState("");
  const [errors, setErrors] = useState<{
    noticeDate?: string;
    noticeBy?: string;
    mymapsUrl?: string;
    submit?: string;
  }>({});
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
    setMymapsUrl(job?.mymaps_url ?? "");
    setErrors({});
    setToastMessage(null);
    setIsSaving(false);
  }, [open, job]);

  const fetchDeliverySummary = async () => {
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
  };

  useEffect(() => {
    if (!open || !job || job.notice_status !== "SCHEDULED") return;
    console.info("[notice-modal] scheduled job ready for delivery tracking", {
      jobId: job.id,
      noticeStatus: job.notice_status
    });
    fetchDeliverySummary();
  }, [open, job?.id, job?.notice_status]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timeout = window.setTimeout(() => {
      setToastMessage(null);
    }, TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const handleSubmit = async () => {
    if (!job) return;
    const nextErrors: typeof errors = {};
    const trimmedMymapsUrl = mymapsUrl.trim();
    if (!noticeDate) {
      nextErrors.noticeDate = "กรุณาระบุวันที่จะไปดำเนินการแจ้ง";
    }
    if (!noticeBy.trim()) {
      nextErrors.noticeBy = "กรุณาระบุผู้แจ้ง";
    }
    if (!trimmedMymapsUrl) {
      nextErrors.mymapsUrl = "กรุณาระบุลิ้ง my map";
    } else {
      const normalizedMymapsUrl = /^https?:\/\//i.test(trimmedMymapsUrl)
        ? trimmedMymapsUrl
        : `https://${trimmedMymapsUrl}`;
      try {
        const parsedUrl = new URL(normalizedMymapsUrl);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          throw new Error("invalid protocol");
        }
      } catch {
        nextErrors.mymapsUrl = "ลิ้งไม่ถูกต้อง";
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    setErrors({});

    try {
      const normalizedMymapsUrl = /^https?:\/\//i.test(trimmedMymapsUrl)
        ? trimmedMymapsUrl
        : `https://${trimmedMymapsUrl}`;
      const payload = {
        jobId: job.id,
        notice_date: noticeDate,
        notice_by: noticeBy.trim(),
        mymaps_url: normalizedMymapsUrl
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
        mymaps_url: payload.mymaps_url,
        notice_scheduled_at: scheduledAt
      });

      setToastMessage("กำหนดการแจ้งเรียบร้อยแล้ว");
      fetchDeliverySummary();
    } catch (error) {
      console.error("Notice schedule failed", error);
      setErrors({
        submit: "บันทึกกำหนดการไม่สำเร็จ กรุณาลองใหม่"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      title="แจ้งหนังสือดับไฟ"
      onClose={() => onOpenChange(false)}
    >
      <div className="flex flex-col gap-4">
        {toastMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {toastMessage}
          </div>
        ) : null}
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-200/90">
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
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-200/90">
          ผู้แจ้ง
          <Input
            type="text"
            value={noticeBy}
            onChange={(event) => setNoticeBy(event.target.value)}
            required
          />
          {errors.noticeBy ? (
            <span className="text-xs text-red-600">{errors.noticeBy}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-200/90">
          ลิ้ง my map
          <Input
            type="url"
            value={mymapsUrl}
            onChange={(event) => setMymapsUrl(event.target.value)}
            placeholder="https://"
            required
          />
          {errors.mymapsUrl ? (
            <span className="text-xs text-red-600">{errors.mymapsUrl}</span>
          ) : null}
        </label>
        {errors.submit ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.submit}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            ยกเลิก
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "กำลังบันทึก..." : "บันทึกกำหนดการ"}
          </Button>
        </div>
        {job?.notice_status === "SCHEDULED" ? (
          <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-900/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-100">
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
              <div className="space-y-2 text-xs text-slate-300">
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
              <p className="text-xs text-slate-400">ยังไม่มีรายการผู้ใช้ไฟรายใหญ่</p>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
