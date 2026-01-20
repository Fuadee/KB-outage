"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
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

  useEffect(() => {
    if (!open) return;
    setNoticeDate(job?.notice_date ?? "");
    setNoticeBy(job?.notice_by ?? "");
    setMymapsUrl(job?.mymaps_url ?? "");
    setErrors({});
    setToastMessage(null);
    setIsSaving(false);
  }, [open, job]);

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
      setTimeout(() => {
        onOpenChange(false);
      }, 800);
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
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          วันที่จะไปดำเนินการแจ้ง
          <input
            type="date"
            value={noticeDate}
            onChange={(event) => setNoticeDate(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
            required
          />
          {errors.noticeDate ? (
            <span className="text-xs text-red-600">{errors.noticeDate}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          ผู้แจ้ง
          <input
            type="text"
            value={noticeBy}
            onChange={(event) => setNoticeBy(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
            required
          />
          {errors.noticeBy ? (
            <span className="text-xs text-red-600">{errors.noticeBy}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          ลิ้ง my map
          <input
            type="url"
            value={mymapsUrl}
            onChange={(event) => setMymapsUrl(event.target.value)}
            placeholder="https://"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
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
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? "กำลังบันทึก..." : "บันทึกกำหนดการ"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
