"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  deleteJob,
  getJob,
  requestDoc,
  setNakhonNotified,
  setNakhonNotRequired,
  updateJob
} from "@/lib/jobsRepo";
import { parseLocalDate } from "@/lib/dateUtils";

const formatThaiDate = (dateString: string) =>
  parseLocalDate(dateString).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [outageDate, setOutageDate] = useState("");
  const [equipmentCode, setEquipmentCode] = useState("");
  const [note, setNote] = useState("");
  const [nakhonStatus, setNakhonStatus] = useState<
    "PENDING" | "NOTIFIED" | "NOT_REQUIRED"
  >("PENDING");
  const [nakhonNotifiedDate, setNakhonNotifiedDate] = useState<string | null>(
    null
  );
  const [nakhonMemoNo, setNakhonMemoNo] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<
    "PENDING" | "REQUESTED" | "GENERATED"
  >("PENDING");
  const [docRequestedAt, setDocRequestedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nakhonFormOpen, setNakhonFormOpen] = useState(false);
  const [nakhonFormDate, setNakhonFormDate] = useState("");
  const [nakhonFormMemoNo, setNakhonFormMemoNo] = useState("");
  const [nakhonFormError, setNakhonFormError] = useState<string | null>(null);
  const [docSaving, setDocSaving] = useState(false);

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

      setOutageDate(data.outage_date);
      setEquipmentCode(data.equipment_code);
      setNote(data.note ?? "");
      setNakhonStatus(data.nakhon_status);
      setNakhonNotifiedDate(data.nakhon_notified_date);
      setNakhonMemoNo(data.nakhon_memo_no);
      setDocStatus(data.doc_status);
      setDocRequestedAt(data.doc_requested_at);
      setLoading(false);
    };

    loadJob();
  }, [params.id]);

  const isStep2Complete = nakhonStatus !== "PENDING";
  const isDocRequested = docStatus !== "PENDING";

  const nakhonStatusLabel = useMemo(() => {
    if (nakhonStatus === "NOTIFIED") return "แจ้งศูนย์นครแล้ว";
    if (nakhonStatus === "NOT_REQUIRED") return "ไม่ต้องแจ้งศูนย์นคร";
    return "รอศูนย์นคร";
  }, [nakhonStatus]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!params.id) return;
    setError(null);
    setNotice(null);

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
    setNotice("บันทึกข้อมูลงานเรียบร้อยแล้ว");
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

  const openNakhonForm = () => {
    setNakhonFormError(null);
    setNakhonFormDate(nakhonNotifiedDate ?? "");
    setNakhonFormMemoNo(nakhonMemoNo ?? "");
    setNakhonFormOpen(true);
  };

  const handleNakhonNotified = async () => {
    if (!params.id) return;
    setNakhonFormError(null);
    setNotice(null);
    if (!nakhonFormDate || !nakhonFormMemoNo.trim()) {
      setNakhonFormError("กรุณากรอกวันที่และเลขที่บันทึกให้ครบถ้วน");
      return;
    }

    setSaving(true);
    const { error: updateError } = await setNakhonNotified(params.id, {
      date: nakhonFormDate,
      memoNo: nakhonFormMemoNo.trim()
    });

    if (updateError) {
      setNakhonFormError(updateError.message);
      setSaving(false);
      return;
    }

    setNakhonStatus("NOTIFIED");
    setNakhonNotifiedDate(nakhonFormDate);
    setNakhonMemoNo(nakhonFormMemoNo.trim());
    setNakhonFormOpen(false);
    setSaving(false);
    setNotice("บันทึกสถานะศูนย์นครเรียบร้อยแล้ว");
  };

  const handleNakhonNotRequired = async () => {
    if (!params.id) return;
    setNotice(null);
    setError(null);
    setSaving(true);
    const { error: updateError } = await setNakhonNotRequired(params.id);
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }
    setNakhonStatus("NOT_REQUIRED");
    setNakhonNotifiedDate(null);
    setNakhonMemoNo(null);
    setSaving(false);
    setNotice("บันทึกว่างานนี้ไม่ต้องแจ้งศูนย์นครแล้ว");
  };

  const handleRequestDoc = async () => {
    if (!params.id || docSaving || !isStep2Complete) return;
    setDocSaving(true);
    setNotice(null);
    setError(null);
    const requestedAt = new Date().toISOString();
    const { error: updateError } = await requestDoc(params.id);
    if (updateError) {
      setError(updateError.message);
      setDocSaving(false);
      return;
    }
    setDocStatus("REQUESTED");
    setDocRequestedAt(requestedAt);
    setDocSaving(false);
    setNotice("บันทึกคำขอสร้างหนังสือแล้ว (กำลังพัฒนา)");
    router.push(`/job/${params.id}/doc`);
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
        <h1 className="text-2xl font-semibold">ติดตามงาน</h1>
        <p className="text-sm text-slate-500">
          อัปเดตข้อมูลและดำเนินการตามขั้นตอนงานดับไฟ
        </p>
      </header>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-600 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
            ขั้นตอน 1
          </span>
          <span>ข้อมูลงาน</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            ขั้นตอน 2
          </span>
          <span>ศูนย์นคร</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            ขั้นตอน 3
          </span>
          <span>หนังสือดับไฟ</span>
        </div>
      </div>

      <form
        onSubmit={handleSave}
        className="flex flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            ขั้นตอน 1: ข้อมูลงาน
          </h2>
          <span className="text-xs font-medium text-slate-500">
            สถานะ: {nakhonStatusLabel}
          </span>
        </div>
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

        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
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

      <section className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              ขั้นตอน 2: ศูนย์นคร
            </h2>
            <p className="text-sm text-slate-500">
              อัปเดตสถานะการแจ้งศูนย์นครของงานนี้
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {nakhonStatusLabel}
          </span>
        </div>

        {nakhonStatus === "PENDING" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openNakhonForm}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
              >
                แจ้งศูนย์นครแล้ว
              </button>
              <button
                type="button"
                onClick={handleNakhonNotRequired}
                className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                ไม่ต้องแจ้งศูนย์นคร
              </button>
            </div>
            {nakhonFormOpen ? (
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  วันที่แจ้งศูนย์นคร
                  <input
                    type="date"
                    value={nakhonFormDate}
                    onChange={(event) => setNakhonFormDate(event.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
                    required
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  เลขที่บันทึก
                  <input
                    type="text"
                    value={nakhonFormMemoNo}
                    onChange={(event) => setNakhonFormMemoNo(event.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
                    required
                  />
                </label>
                {nakhonFormError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {nakhonFormError}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleNakhonNotified}
                    className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
                  >
                    บันทึก
                  </button>
                  <button
                    type="button"
                    onClick={() => setNakhonFormOpen(false)}
                    className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : nakhonStatus === "NOTIFIED" ? (
          <div className="flex flex-col gap-2 text-sm text-slate-700">
            <p>
              แจ้งศูนย์นครแล้ว วันที่:{" "}
              <span className="font-medium">
                {nakhonNotifiedDate ? formatThaiDate(nakhonNotifiedDate) : "-"}
              </span>
              {" "}เลขที่บันทึก:{" "}
              <span className="font-medium">{nakhonMemoNo ?? "-"}</span>
            </p>
            <button
              type="button"
              onClick={openNakhonForm}
              className="w-fit text-sm font-medium text-slate-700 underline-offset-4 hover:text-slate-900 hover:underline"
            >
              แก้ไขข้อมูล
            </button>
            {nakhonFormOpen ? (
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  วันที่แจ้งศูนย์นคร
                  <input
                    type="date"
                    value={nakhonFormDate}
                    onChange={(event) => setNakhonFormDate(event.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
                    required
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  เลขที่บันทึก
                  <input
                    type="text"
                    value={nakhonFormMemoNo}
                    onChange={(event) => setNakhonFormMemoNo(event.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
                    required
                  />
                </label>
                {nakhonFormError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {nakhonFormError}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleNakhonNotified}
                    className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
                  >
                    บันทึก
                  </button>
                  <button
                    type="button"
                    onClick={() => setNakhonFormOpen(false)}
                    className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm text-slate-700">
            <p>งานนี้ไม่ต้องแจ้งศูนย์นคร</p>
            <button
              type="button"
              onClick={openNakhonForm}
              className="w-fit text-sm font-medium text-slate-700 underline-offset-4 hover:text-slate-900 hover:underline"
            >
              เปลี่ยนเป็นแจ้งศูนย์นคร
            </button>
            {nakhonFormOpen ? (
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  วันที่แจ้งศูนย์นคร
                  <input
                    type="date"
                    value={nakhonFormDate}
                    onChange={(event) => setNakhonFormDate(event.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
                    required
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  เลขที่บันทึก
                  <input
                    type="text"
                    value={nakhonFormMemoNo}
                    onChange={(event) => setNakhonFormMemoNo(event.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
                    required
                  />
                </label>
                {nakhonFormError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {nakhonFormError}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleNakhonNotified}
                    className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
                  >
                    บันทึก
                  </button>
                  <button
                    type="button"
                    onClick={() => setNakhonFormOpen(false)}
                    className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            ขั้นตอน 3: หนังสือดับไฟ
          </h2>
          <p className="text-sm text-slate-500">
            ขอให้ระบบสร้างหนังสือดับไฟเมื่อพร้อม
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleRequestDoc}
            disabled={!isStep2Complete || docSaving || isDocRequested}
            className="w-fit rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {docSaving
              ? "กำลังบันทึก..."
              : isDocRequested
              ? "ส่งคำขอแล้ว"
              : "สร้างหนังสือดับไฟ"}
          </button>
          {!isStep2Complete ? (
            <span className="text-sm text-amber-600">
              กรุณาทำขั้นตอนศูนย์นครก่อน
            </span>
          ) : null}
          {docRequestedAt ? (
            <span className="text-sm text-slate-600">
              บันทึกคำขอเมื่อ: {formatThaiDate(docRequestedAt.split("T")[0])}
            </span>
          ) : null}
          {isDocRequested ? (
            <span className="text-sm text-slate-600">
              สถานะปัจจุบัน: {docStatus}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
