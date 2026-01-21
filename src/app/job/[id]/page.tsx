"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import MapActionButtons from "@/components/job/MapActionButtons";
import NoticeScheduleModal from "@/components/NoticeScheduleModal";
import Modal from "@/components/Modal";
import { getJob, OutageJob, updateJob } from "@/lib/jobsRepo";
import { supabase } from "@/lib/supabaseClient";

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [outageDate, setOutageDate] = useState("");
  const [equipmentCode, setEquipmentCode] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<OutageJob | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);

  useEffect(() => {
    const loadJob = async () => {
      if (!params.id) return;
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await getJob(params.id);
      if (fetchError || !data) {
        setError(fetchError?.message ?? "ไม่พบงานที่ต้องการ");
        setLoading(false);
        return;
      }

      setJob(data);
      setOutageDate(data.outage_date);
      setEquipmentCode(data.equipment_code);
      setNote(data.note ?? "");
      setLoading(false);
    };

    loadJob();
  }, [params.id]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!params.id) return;
    if (job?.is_closed) return;
    setError(null);

    if (!outageDate || !equipmentCode.trim()) {
      setError("กรุณากรอกวันที่และรหัสอุปกรณ์");
      return;
    }

    setSaving(true);
    const { error: updateError } = await updateJob(params.id, {
      outage_date: outageDate,
      equipment_code: equipmentCode.trim(),
      note: note.trim() ? note.trim() : null
    });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push("/");
  };

  const handleDelete = async () => {
    if (!params.id) return;
    if (job?.is_closed) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${params.id}/delete`, {
        method: "DELETE"
      });
      const result = await response.json().catch(() => null);
      if (process.env.NODE_ENV !== "production") {
        console.info("Delete job response", { response, result });
      }
      if (!response.ok || !result?.ok || result.deletedCount === 0) {
        const message =
          result?.error ?? "ลบไม่สำเร็จ (สิทธิไม่อนุญาตหรือไม่พบรายการ)";
        setError(message);
        setToast({ message, tone: "error" });
        setSaving(false);
        return;
      }
      router.push("/");
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "ลบไม่สำเร็จ (สิทธิไม่อนุญาตหรือไม่พบรายการ)";
      setError(message);
      setToast({ message, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleNoticeJobUpdate = (patch: Partial<OutageJob>) => {
    setJob((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleCloseJob = async () => {
    if (!job) return;
    setCloseSaving(true);
    setCloseError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setCloseSaving(false);
      setCloseOpen(false);
      router.push("/login");
      return;
    }

    try {
      const response = await fetch(`/api/jobs/${job.id}/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (response.status === 401) {
        setCloseSaving(false);
        setCloseOpen(false);
        router.push("/login");
        return;
      }
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "ปิดงานไม่สำเร็จ กรุณาลองใหม่");
      }
      setToast({ message: "✅ ปิดงานเรียบร้อย", tone: "success" });
      setJob((prev) =>
        prev
          ? {
              ...prev,
              is_closed: true,
              closed_at: result.closed_at ?? new Date().toISOString()
            }
          : prev
      );
      setCloseOpen(false);
    } catch (closeError) {
      const message =
        closeError instanceof Error
          ? closeError.message
          : "ปิดงานไม่สำเร็จ กรุณาลองใหม่";
      setCloseError(message);
      setToast({ message, tone: "error" });
    } finally {
      setCloseSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
        กำลังโหลดข้อมูล...
      </div>
    );
  }

  const isClosed = job?.is_closed ?? false;
  const canCloseJob =
    (job?.notice_status ?? "NONE") === "SCHEDULED" && !isClosed;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {isClosed ? "รายละเอียดงาน" : "แก้ไขงาน"}
        </h1>
        <p className="text-sm text-slate-500">
          {isClosed
            ? "งานนี้ถูกปิดแล้วและไม่สามารถแก้ไขได้"
            : "ปรับปรุงรายละเอียดหรือลบงานนี้ออกจากระบบ"}
        </p>
        {toast ? (
          <div
            className={`mt-2 rounded-xl border px-4 py-3 text-sm ${
              toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {toast.message}
          </div>
        ) : null}
        {isClosed ? (
          <div className="mt-2 text-sm text-slate-600">
            ปิดเมื่อ{" "}
            <span className="font-medium text-slate-800">
              {job?.closed_at
                ? new Date(job.closed_at).toLocaleString("th-TH", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })
                : "-"}
            </span>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {job?.social_status === "POSTED" && !isClosed ? (
            <button
              type="button"
              onClick={() => setNoticeOpen(true)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              {(job.notice_status ?? "NONE") === "SCHEDULED"
                ? "กำหนดการแจ้งเรียบร้อยแล้ว (แก้ไขได้)"
                : "แจ้งหนังสือดับไฟ"}
            </button>
          ) : null}
          {canCloseJob ? (
            <button
              type="button"
              onClick={() => {
                setCloseError(null);
                setCloseOpen(true);
              }}
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-400"
            >
              ปิดงาน
            </button>
          ) : null}
        </div>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">ลิงก์แผนที่</h2>
        <MapActionButtons
          googleUrl={job?.map_link}
          myMapUrl={job?.mymaps_url}
          className="mt-3"
        />
      </div>

      <form
        onSubmit={handleSave}
        className="flex flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm"
      >
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          วันที่ดับไฟ
          <input
            type="date"
            value={outageDate}
            onChange={(event) => setOutageDate(event.target.value)}
            disabled={isClosed}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          รหัสอุปกรณ์
          <input
            type="text"
            value={equipmentCode}
            onChange={(event) => setEquipmentCode(event.target.value)}
            disabled={isClosed}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          หมายเหตุเพิ่มเติม
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            disabled={isClosed}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {!isClosed ? (
            <>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="rounded-xl border border-red-200 px-5 py-2 text-sm font-medium text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                ลบงาน
              </button>
            </>
          ) : null}
          <Link
            href="/"
            className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
          >
            กลับ
          </Link>
        </div>
      </form>

      <NoticeScheduleModal
        job={job}
        open={noticeOpen}
        onOpenChange={setNoticeOpen}
        onJobUpdate={(_, patch) => handleNoticeJobUpdate(patch)}
      />

      <Modal
        isOpen={closeOpen}
        title="ยืนยันปิดงาน?"
        onClose={() => setCloseOpen(false)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            ปิดงานแล้วจะถูกย้ายไปที่ &quot;งานที่ปิดแล้ว&quot;
            และไม่สามารถแก้ไขได้
          </p>
          {closeError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {closeError}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setCloseOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleCloseJob}
              disabled={closeSaving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {closeSaving ? "กำลังปิดงาน..." : "ยืนยันปิดงาน"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
