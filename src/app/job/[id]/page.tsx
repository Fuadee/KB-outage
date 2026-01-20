"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import NoticeScheduleModal from "@/components/NoticeScheduleModal";
import { deleteJob, getJob, OutageJob, updateJob } from "@/lib/jobsRepo";

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

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!params.id) return;
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
    setSaving(true);
    setError(null);
    const { error: deleteError } = await deleteJob(params.id);
    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }
    router.push("/");
  };

  const handleNoticeJobUpdate = (patch: Partial<OutageJob>) => {
    setJob((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
        กำลังโหลดข้อมูล...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">แก้ไขงาน</h1>
        <p className="text-sm text-slate-500">
          ปรับปรุงรายละเอียดหรือลบงานนี้ออกจากระบบ
        </p>
        {job?.social_status === "POSTED" ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setNoticeOpen(true)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              {(job.notice_status ?? "NONE") === "SCHEDULED"
                ? "กำหนดการแจ้งเรียบร้อยแล้ว (แก้ไขได้)"
                : "แจ้งหนังสือดับไฟ"}
            </button>
          </div>
        ) : null}
      </header>

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
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
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
    </div>
  );
}
