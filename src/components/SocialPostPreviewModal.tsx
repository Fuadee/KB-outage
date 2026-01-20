import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import type { OutageJob } from "@/lib/jobsRepo";
import {
  buildSocialPostText,
  getSocialPostPreview
} from "@/lib/socialPost";

const TOAST_TIMEOUT_MS = 3000;

type SocialPostPreviewModalProps = {
  job: OutageJob | null;
  isOpen: boolean;
  onClose: () => void;
  onJobUpdate: (jobId: string, patch: Partial<OutageJob>) => void;
};

export default function SocialPostPreviewModal({
  job,
  isOpen,
  onClose,
  onJobUpdate
}: SocialPostPreviewModalProps) {
  const [isPosting, setIsPosting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const previewText = useMemo(() => {
    if (!job) return "";
    return getSocialPostPreview(job);
  }, [job]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timeout = window.setTimeout(() => {
      setToastMessage(null);
    }, TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const handleCopy = async () => {
    if (!previewText) return;
    try {
      await navigator.clipboard.writeText(previewText);
      setToastMessage("คัดลอกข้อความแล้ว — ไปวางใน Facebook/LINE ได้เลย");
    } catch (error) {
      console.error("Failed to copy text", error);
      setToastMessage("คัดลอกข้อความไม่สำเร็จ กรุณาลองใหม่");
    }
  };

  const handlePost = async () => {
    if (!job || !previewText) return;

    if (job.social_status === "POSTED") {
      await handleCopy();
      return;
    }

    setIsPosting(true);

    try {
      const response = await fetch("/api/jobs/social-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id })
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "ไม่สามารถโพสต์ข้อความได้");
      }

      onJobUpdate(job.id, {
        social_status: "POSTED",
        social_post_text: result.preview_text ?? buildSocialPostText(job),
        social_posted_at: result.social_posted_at ?? new Date().toISOString()
      });

      await handleCopy();
    } catch (error) {
      console.error("Social post failed", error);
      setToastMessage("โพสต์ข้อความไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title="ตัวอย่างข้อความโพสต์ Social"
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {toastMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {toastMessage}
          </div>
        ) : null}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="whitespace-pre-wrap leading-relaxed">
            {previewText || "-"}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
          >
            คัดลอกข้อความ
          </button>
          <button
            type="button"
            onClick={handlePost}
            disabled={isPosting || !previewText}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPosting ? "กำลังโพสต์..." : "Post ลงสื่อ social"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
