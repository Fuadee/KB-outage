import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import MapActionButtons from "@/components/job/MapActionButtons";
import Button from "@/components/ui/Button";
import type { OutageJob } from "@/lib/jobsRepo";
import { buildSocialPostText } from "@/lib/socialPost";

const TOAST_TIMEOUT_MS = 3000;

type SocialRatio = "16:9" | "1:1" | "9:16";

type PosterResult = {
  imageUrl: string;
  captionShort: string;
  variants: {
    facebook: string;
    line: string;
    story: string;
  };
};

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
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);
  const [selectedRatio, setSelectedRatio] = useState<SocialRatio>("16:9");
  const [poster, setPoster] = useState<PosterResult | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const detailedText = useMemo(() => {
    if (!job) return "";
    return buildSocialPostText(job);
  }, [job]);

  const captionShort =
    poster?.captionShort ||
    "⚡ แจ้งงดจ่ายไฟชั่วคราว\nรายละเอียดพื้นที่และเวลาอยู่ในภาพประกาศด้านล่างครับ";

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timeout = window.setTimeout(() => {
      setToastMessage(null);
    }, TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (!job) {
      setPoster(null);
      setSelectedRatio("16:9");
    }
  }, [job]);

  const currentPosterImage = useMemo(() => {
    if (!poster) return null;
    if (selectedRatio === "1:1") return poster.variants.line;
    if (selectedRatio === "9:16") return poster.variants.story;
    return poster.variants.facebook;
  }, [poster, selectedRatio]);

  const handleCopy = async (showToast = true) => {
    if (!captionShort) return;
    try {
      await navigator.clipboard.writeText(captionShort);
      if (showToast) {
        setToastMessage("คัดลอกข้อความสั้นแล้ว");
      }
    } catch (error) {
      console.error("Failed to copy text", error);
      if (showToast) {
        setToastMessage("คัดลอกข้อความไม่สำเร็จ กรุณาลองใหม่");
      }
    }
  };

  const handleGeneratePoster = async () => {
    if (!job) return;
    setIsGeneratingPoster(true);
    try {
      const response = await fetch("/api/ai/outage-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          platform: "facebook",
          ratio: selectedRatio
        })
      });

      const result = (await response.json().catch(() => null)) as PosterResult | null;
      if (!response.ok || !result?.imageUrl || !result?.variants) {
        throw new Error("ไม่สามารถสร้างภาพประกาศได้");
      }

      setPoster(result);
      setToastMessage("สร้างภาพประกาศแล้ว");
    } catch (error) {
      console.error("Poster generation failed", error);
      setToastMessage("สร้างภาพประกาศไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsGeneratingPoster(false);
    }
  };

  const handlePost = async () => {
    if (!job) return;
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
        ...(result.job ?? {}),
        social_status: result.social_status ?? "POSTED",
        social_post_text: result.social_post_text ?? captionShort,
        social_posted_at: result.social_posted_at ?? new Date().toISOString()
      });

      setToastMessage("โพสต์ข้อความสำเร็จแล้ว");
      window.setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      console.error("Social post failed", error);
      setToastMessage("โพสต์ข้อความไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsPosting(false);
    }
  };

  const handleDownloadImage = () => {
    if (!currentPosterImage) return;
    window.open(currentPosterImage, "_blank", "noopener,noreferrer");
  };

  return (
    <Modal isOpen={isOpen} title="สร้างภาพประกาศดับไฟ" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {toastMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {toastMessage}
          </div>
        ) : null}

        <div className="rounded-xl border border-orange-300/60 bg-slate-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="rounded-md bg-orange-500 px-3 py-1 text-sm font-bold text-slate-950">แจ้งประกาศดับไฟ</p>
            <span className="text-xs text-orange-200">Ratio {selectedRatio}</span>
          </div>

          <div className="overflow-hidden rounded-lg border border-orange-200/30 bg-gradient-to-br from-violet-600 via-orange-500 to-yellow-400">
            <div className="aspect-video w-full bg-slate-800/30">
              {currentPosterImage ? (
                <img src={currentPosterImage} alt="Outage poster preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-white/90">
                  {job?.map_link ? "แสดงพื้นหลังแผนที่จาก map_link เมื่อสร้างภาพ" : "ยังไม่มี map_link ใช้พื้นหลังสีแจ้งเตือนแทน"}
                </div>
              )}
            </div>
            <div className="grid gap-1 bg-slate-950/80 p-3 text-xs text-orange-50 md:grid-cols-3">
              <p>บริเวณ: {job?.doc_area_title || "-"}</p>
              <p>วันที่: {job?.outage_date || "-"}</p>
              <p>เวลา: {job?.doc_time_start || "-"} - {job?.doc_time_end || "-"}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setSelectedRatio("16:9")}>Facebook 16:9</Button>
          <Button type="button" variant="secondary" onClick={() => setSelectedRatio("1:1")}>LINE 1:1</Button>
          <Button type="button" variant="secondary" onClick={() => setSelectedRatio("9:16")}>Story 9:16</Button>
        </div>

        <Button type="button" onClick={handleGeneratePoster} disabled={isGeneratingPoster || !job}>
          {isGeneratingPoster ? "กำลังสร้างภาพ..." : "✨ สร้างภาพประกาศด้วย AI"}
        </Button>

        <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="mb-1 text-xs font-semibold text-slate-500">ข้อความประกอบโพสต์แบบสั้น</p>
          <p className="whitespace-pre-wrap leading-relaxed">{captionShort}</p>
        </div>

        <details className="rounded-xl border border-slate-200/70 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">ข้อความแบบละเอียด</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{detailedText || "-"}</p>
        </details>

        <div className="rounded-xl border border-slate-200/70 bg-white p-3">
          <MapActionButtons googleUrl={job?.map_link} />
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleDownloadImage} disabled={!currentPosterImage}>ดาวน์โหลดภาพ</Button>
          <Button type="button" variant="secondary" onClick={() => void handleCopy(true)}>คัดลอกข้อความสั้น</Button>
          <Button type="button" variant="secondary" onClick={() => job?.map_link && window.open(job.map_link, "_blank", "noopener,noreferrer")} disabled={!job?.map_link}>เปิดแผนที่</Button>
          <Button type="button" onClick={handlePost} disabled={isPosting || !job}>{isPosting ? "กำลังโพสต์..." : "Post ลง Social"}</Button>
        </div>
      </div>
    </Modal>
  );
}
