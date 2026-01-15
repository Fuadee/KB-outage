"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import {
  listJobs,
  OutageJob,
  requestDoc,
  setNakhonNotified,
  setNakhonNotRequired
} from "@/lib/jobsRepo";
import {
  daysBetween,
  getStatusColor,
  getStatusLabel,
  parseLocalDate
} from "@/lib/dateUtils";

type FilterOption = "all" | "green" | "yellow" | "red";

export default function DashboardPage() {
  const [jobs, setJobs] = useState<OutageJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [docNoticeById, setDocNoticeById] = useState<Record<string, string>>(
    {}
  );
  const [selectedJob, setSelectedJob] = useState<OutageJob | null>(null);
  const [notifiedDate, setNotifiedDate] = useState("");
  const [memoNo, setMemoNo] = useState("");
  const [modalErrors, setModalErrors] = useState<{
    date?: string;
    memoNo?: string;
    submit?: string;
  }>({});
  const [modalSaving, setModalSaving] = useState(false);

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      setError(null);
      setActionError(null);
      const { data, error: fetchError } = await listJobs();
      if (fetchError) {
        setError(fetchError.message);
        setJobs([]);
      } else {
        setJobs(data ?? []);
      }
      setLoading(false);
    };

    fetchJobs();
  }, []);

  const closeModal = () => {
    setSelectedJob(null);
    setNotifiedDate("");
    setMemoNo("");
    setModalErrors({});
    setModalSaving(false);
  };

  const openNotifiedModal = (job: OutageJob) => {
    setSelectedJob(job);
    setNotifiedDate("");
    setMemoNo("");
    setModalErrors({});
  };

  const handleSubmitNotified = async () => {
    if (!selectedJob) return;
    const nextErrors: typeof modalErrors = {};
    if (!notifiedDate) {
      nextErrors.date = "กรุณาระบุวันที่แจ้งศูนย์นคร";
    }
    if (!memoNo.trim()) {
      nextErrors.memoNo = "กรุณาระบุเลขที่บันทึก";
    }
    if (Object.keys(nextErrors).length > 0) {
      setModalErrors(nextErrors);
      return;
    }

    setModalSaving(true);
    setModalErrors({});
    const { error: updateError } = await setNakhonNotified(selectedJob.id, {
      date: notifiedDate,
      memoNo: memoNo.trim()
    });

    if (updateError) {
      setModalErrors({
        submit: updateError.message || "บันทึกไม่สำเร็จ กรุณาลองใหม่"
      });
      setModalSaving(false);
      return;
    }

    setJobs((prev) =>
      prev.map((job) =>
        job.id === selectedJob.id
          ? {
              ...job,
              nakhon_status: "NOTIFIED",
              nakhon_notified_date: notifiedDate,
              nakhon_memo_no: memoNo.trim()
            }
          : job
      )
    );
    closeModal();
  };

  const handleNotRequired = async (job: OutageJob) => {
    setActionError(null);
    setActionLoading((prev) => ({ ...prev, [job.id]: true }));
    const { error: updateError } = await setNakhonNotRequired(job.id);

    if (updateError) {
      setActionError(updateError.message || "อัปเดตไม่สำเร็จ");
      setActionLoading((prev) => ({ ...prev, [job.id]: false }));
      return;
    }

    setJobs((prev) =>
      prev.map((item) =>
        item.id === job.id
          ? {
              ...item,
              nakhon_status: "NOT_REQUIRED",
              nakhon_notified_date: null,
              nakhon_memo_no: null
            }
          : item
      )
    );
    setActionLoading((prev) => ({ ...prev, [job.id]: false }));
  };

  const handleRequestDoc = async (job: OutageJob) => {
    setActionError(null);
    setActionLoading((prev) => ({ ...prev, [job.id]: true }));
    const { error: updateError } = await requestDoc(job.id);

    if (updateError) {
      setActionError(updateError.message || "อัปเดตไม่สำเร็จ");
      setActionLoading((prev) => ({ ...prev, [job.id]: false }));
      return;
    }

    const timestamp = new Date().toISOString();
    setJobs((prev) =>
      prev.map((item) =>
        item.id === job.id
          ? {
              ...item,
              doc_status: "REQUESTED",
              doc_requested_at: timestamp
            }
          : item
      )
    );
    setDocNoticeById((prev) => ({
      ...prev,
      [job.id]: "บันทึกคำขอสร้างเอกสารแล้ว (กำลังพัฒนา)"
    }));
    setActionLoading((prev) => ({ ...prev, [job.id]: false }));
  };

  const filteredJobs = useMemo(() => {
    const today = new Date();
    const normalizedQuery = query.trim().toLowerCase();
    return jobs
      .filter((job) => {
        if (!normalizedQuery) return true;
        return job.equipment_code.toLowerCase().includes(normalizedQuery);
      })
      .filter((job) => {
        if (filter === "all") return true;
        const daysLeft = daysBetween(today, parseLocalDate(job.outage_date));
        const color = getStatusColor(daysLeft).name;
        return color === filter;
      })
      .sort((a, b) =>
        parseLocalDate(a.outage_date).getTime() -
        parseLocalDate(b.outage_date).getTime()
      );
  }, [jobs, query, filter]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Krabi Outage Tracker</h1>
            <p className="text-sm text-slate-500">
              ติดตามงานดับไฟตามกำหนดและสถานะวันคงเหลือ
            </p>
          </div>
          <Link
            href="/new"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
          >
            + สร้างงาน
          </Link>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full max-w-md flex-col gap-2">
            <label className="text-sm font-medium text-slate-600">
              ค้นหาอุปกรณ์
            </label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="กรอกรหัสอุปกรณ์"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all", label: "ทั้งหมด" },
                { id: "green", label: "เขียว" },
                { id: "yellow", label: "เหลือง" },
                { id: "red", label: "แดง" }
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                onClick={() => setFilter(option.id)}
                className={`rounded-full px-4 py-1 text-sm font-medium transition ${
                  filter === option.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {actionError}
        </div>
      ) : null}

      <section className="grid gap-4">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            กำลังโหลดข้อมูล...
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            ยังไม่มีงานที่ตรงกับตัวกรอง
          </div>
        ) : (
          filteredJobs.map((job) => {
            const today = new Date();
            const daysLeft = daysBetween(today, parseLocalDate(job.outage_date));
            const status = getStatusColor(daysLeft);
            const nakhonStatus = job.nakhon_status ?? "PENDING";
            const isPending = nakhonStatus === "PENDING";
            const isNotified = nakhonStatus === "NOTIFIED";
            const isNotRequired = nakhonStatus === "NOT_REQUIRED";
            const actionDisabled = actionLoading[job.id] ?? false;
            const docNotice = docNoticeById[job.id];
            return (
              <div
                key={job.id}
                className="group flex items-stretch overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md"
              >
                <div className={`w-2 ${status.strip}`} />
                <div className="flex w-full flex-col gap-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <Link
                      href={`/job/${job.id}`}
                      className="flex min-w-[240px] flex-1 flex-col gap-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-col">
                          <span className="text-sm text-slate-500">
                            {parseLocalDate(job.outage_date).toLocaleDateString(
                              "th-TH",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric"
                              }
                            )}
                          </span>
                          <span className={`text-sm font-medium ${status.text}`}>
                            {getStatusLabel(daysLeft)}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${status.badge}`}
                        >
                          {status.name.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-slate-900">
                          {job.equipment_code}
                        </p>
                        <p className="text-sm text-slate-600">
                          {job.note?.trim() || "ไม่มีหมายเหตุ"}
                        </p>
                      </div>
                    </Link>

                    <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
                      {isPending ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openNotifiedModal(job)}
                            className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 sm:w-auto"
                          >
                            แจ้งศูนย์นครแล้ว
                          </button>
                          <button
                            type="button"
                            onClick={() => handleNotRequired(job)}
                            disabled={actionDisabled}
                            className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                          >
                            {actionDisabled
                              ? "กำลังบันทึก..."
                              : "ไม่ต้องแจ้งศูนย์นคร"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRequestDoc(job)}
                          disabled={actionDisabled}
                          className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                        >
                          {actionDisabled
                            ? "กำลังบันทึก..."
                            : "สร้างเอกสารดับไฟ"}
                        </button>
                      )}
                    </div>
                  </div>
                  {(isNotified || isNotRequired) && (
                    <div className="text-sm text-slate-600">
                      {isNotified ? (
                        <>
                          แจ้งศูนย์นครแล้ว:{" "}
                          <span className="font-medium text-slate-800">
                            {job.nakhon_notified_date
                              ? parseLocalDate(
                                  job.nakhon_notified_date
                                ).toLocaleDateString("th-TH", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric"
                                })
                              : "-"}
                          </span>{" "}
                          | เลขที่บันทึก:{" "}
                          <span className="font-medium text-slate-800">
                            {job.nakhon_memo_no ?? "-"}
                          </span>
                        </>
                      ) : (
                        <span>ไม่ต้องแจ้งศูนย์นคร</span>
                      )}
                    </div>
                  )}
                  {docNotice ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {docNotice}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </section>

      <Modal
        isOpen={Boolean(selectedJob)}
        title="แจ้งศูนย์นครแล้ว"
        onClose={closeModal}
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            วันที่แจ้งศูนย์นคร
            <input
              type="date"
              value={notifiedDate}
              onChange={(event) => setNotifiedDate(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
              required
            />
            {modalErrors.date ? (
              <span className="text-xs text-red-600">{modalErrors.date}</span>
            ) : null}
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            เลขที่บันทึก
            <input
              type="text"
              value={memoNo}
              onChange={(event) => setMemoNo(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
              required
            />
            {modalErrors.memoNo ? (
              <span className="text-xs text-red-600">{modalErrors.memoNo}</span>
            ) : null}
          </label>
          {modalErrors.submit ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {modalErrors.submit}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSubmitNotified}
              disabled={modalSaving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {modalSaving ? "กำลังบันทึก..." : "ตกลง"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
