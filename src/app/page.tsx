"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import SocialPostPreviewModal from "@/components/SocialPostPreviewModal";
import {
  listJobs,
  OutageJob,
  setNakhonNotified,
  setNakhonNotRequired
} from "@/lib/jobsRepo";
import {
  getJobUrgency,
  getUrgencyStyles,
  parseLocalDate
} from "@/lib/dateUtils";

type FilterOption = "all" | "green" | "yellow" | "red";

type DocForm = {
  doc_issue_date: string;
  doc_purpose: string;
  doc_area_title: string;
  doc_time_start: string;
  doc_time_end: string;
  doc_area_detail: string;
  map_link: string;
};

const getFilenameFromContentDisposition = (
  headerValue: string | null
): string | null => {
  if (!headerValue) return null;

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const filenameMatch = headerValue.match(/filename="?([^";]+)"?/i);
  return filenameMatch?.[1] ?? null;
};

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
  const [selectedJob, setSelectedJob] = useState<OutageJob | null>(null);
  const [notifiedDate, setNotifiedDate] = useState("");
  const [memoNo, setMemoNo] = useState("");
  const [modalErrors, setModalErrors] = useState<{
    date?: string;
    memoNo?: string;
    submit?: string;
  }>({});
  const [modalSaving, setModalSaving] = useState(false);
  const [docJob, setDocJob] = useState<OutageJob | null>(null);
  const [socialJob, setSocialJob] = useState<OutageJob | null>(null);
  const [docForm, setDocForm] = useState<DocForm>({
    doc_issue_date: "",
    doc_purpose: "",
    doc_area_title: "",
    doc_time_start: "",
    doc_time_end: "",
    doc_area_detail: "",
    map_link: ""
  });
  const [docErrors, setDocErrors] = useState<Partial<
    Record<keyof DocForm | "submit", string>
  >>({});
  const [docSaving, setDocSaving] = useState(false);

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

  const closeDocModal = () => {
    setDocJob(null);
    setDocForm({
      doc_issue_date: "",
      doc_purpose: "",
      doc_area_title: "",
      doc_time_start: "",
      doc_time_end: "",
      doc_area_detail: "",
      map_link: ""
    });
    setDocErrors({});
    setDocSaving(false);
  };

  const closeSocialModal = () => {
    setSocialJob(null);
  };

  const openNotifiedModal = (job: OutageJob) => {
    setSelectedJob(job);
    setNotifiedDate("");
    setMemoNo("");
    setModalErrors({});
  };

  const openDocModal = (job: OutageJob) => {
    setDocJob(job);
    setDocForm({
      doc_issue_date: job.doc_issue_date ?? "",
      doc_purpose: job.doc_purpose ?? "",
      doc_area_title: job.doc_area_title ?? "",
      doc_time_start: job.doc_time_start ?? "",
      doc_time_end: job.doc_time_end ?? "",
      doc_area_detail: job.doc_area_detail ?? "",
      map_link: job.map_link ?? ""
    });
    setDocErrors({});
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

  const handleCreateDoc = async () => {
    if (!docJob) return;
    const nextErrors: typeof docErrors = {};
    if (!docForm.doc_issue_date) {
      nextErrors.doc_issue_date = "กรุณาระบุวันที่ออกหนังสือ";
    }
    if (!docForm.doc_purpose.trim()) {
      nextErrors.doc_purpose = "กรุณาระบุวัตถุประสงค์";
    }
    if (!docForm.doc_area_title.trim()) {
      nextErrors.doc_area_title = "กรุณาระบุบริเวณที่ดับ";
    }
    if (!docForm.doc_time_start.trim()) {
      nextErrors.doc_time_start = "กรุณาระบุเวลาเริ่มดับไฟ";
    }
    if (!docForm.doc_time_end.trim()) {
      nextErrors.doc_time_end = "กรุณาระบุเวลาจ่ายไฟ";
    }
    if (!docForm.doc_area_detail.trim()) {
      nextErrors.doc_area_detail = "กรุณาระบุรายละเอียดพื้นที่ดับไฟ";
    }
    if (!docForm.map_link.trim()) {
      nextErrors.map_link = "กรุณาระบุลิ้ง google map";
    }

    if (Object.keys(nextErrors).length > 0) {
      setDocErrors(nextErrors);
      return;
    }

    const payload = {
      doc_issue_date: docForm.doc_issue_date,
      doc_purpose: docForm.doc_purpose.trim(),
      doc_area_title: docForm.doc_area_title.trim(),
      doc_time_start: docForm.doc_time_start.trim(),
      doc_time_end: docForm.doc_time_end.trim(),
      doc_area_detail: docForm.doc_area_detail.trim(),
      map_link: docForm.map_link.trim()
    };

    setDocSaving(true);
    setDocErrors({});

    try {
      const response = await fetch("/api/docs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: docJob.id,
          payload
        })
      });

      if (!response.ok) {
        const contentType = response.headers.get("Content-Type") ?? "";
        let detail = "";
        if (contentType.includes("application/json")) {
          const result = await response.json().catch(() => null);
          detail = result?.error || result?.message || "";
        } else {
          detail = await response.text().catch(() => "");
        }
        setDocErrors({
          submit: detail
            ? `ไม่สามารถสร้างเอกสารได้ กรุณาลองใหม่ (${detail})`
            : "ไม่สามารถสร้างเอกสารได้ กรุณาลองใหม่"
        });
        setDocSaving(false);
        return;
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const filename =
        getFilenameFromContentDisposition(
          response.headers.get("Content-Disposition")
        ) ?? `outage-doc-${docJob.id}.docx`;
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);

      const generatedAt = new Date().toISOString();
      setJobs((prev) =>
        prev.map((item) =>
          item.id === docJob.id
            ? {
                ...item,
                ...payload,
                doc_status: "GENERATED",
                doc_url: null,
                doc_generated_at: generatedAt
              }
            : item
        )
      );
      try {
        const socialResponse = await fetch("/api/jobs/social-pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: docJob.id })
        });
        const socialResult = await socialResponse.json().catch(() => null);
        if (socialResponse.ok && socialResult?.ok) {
          setJobs((prev) =>
            prev.map((item) =>
              item.id === docJob.id
                ? { ...item, social_status: "PENDING_APPROVAL" }
                : item
            )
          );
        } else {
          console.warn("Failed to set social pending status", socialResult);
        }
      } catch (socialError) {
        console.warn("Failed to set social pending status", socialError);
      }
      closeDocModal();
    } catch (submitError) {
      console.error(submitError);
      setDocErrors({
        submit: "สร้างเอกสารไม่สำเร็จ กรุณาลองใหม่"
      });
      setDocSaving(false);
    }
  };

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return jobs
      .filter((job) => {
        if (!normalizedQuery) return true;
        return job.equipment_code.toLowerCase().includes(normalizedQuery);
      })
      .filter((job) => {
        if (filter === "all") return true;
        const urgency = getJobUrgency(job);
        return urgency.color.toLowerCase() === filter;
      })
      .sort((a, b) =>
        parseLocalDate(a.outage_date).getTime() -
        parseLocalDate(b.outage_date).getTime()
      );
  }, [jobs, query, filter]);

  const handleSocialJobUpdate = (
    jobId: string,
    patch: Partial<OutageJob>
  ) => {
    setJobs((prev) =>
      prev.map((item) => (item.id === jobId ? { ...item, ...patch } : item))
    );
    setSocialJob((prev) =>
      prev?.id === jobId ? { ...prev, ...patch } : prev
    );
  };

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
            const urgency = getJobUrgency(job);
            const status = getUrgencyStyles(urgency.color);
            const nakhonStatus = job.nakhon_status ?? "PENDING";
            const isPending = nakhonStatus === "PENDING";
            const isNotified = nakhonStatus === "NOTIFIED";
            const isNotRequired = nakhonStatus === "NOT_REQUIRED";
            const actionDisabled = actionLoading[job.id] ?? false;
            const isDocGenerated =
              job.doc_status === "GENERATED" && Boolean(job.doc_url);
            const isDocGenerating = job.doc_status === "GENERATING";
            const socialStatus = job.social_status ?? "DRAFT";
            const showSocialButton =
              socialStatus === "PENDING_APPROVAL" || socialStatus === "POSTED";
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
                            {urgency.label}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${status.badge}`}
                        >
                          {urgency.color}
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
                        <>
                          {isDocGenerated ? (
                            <button
                              type="button"
                              onClick={() => window.open(job.doc_url!, "_blank")}
                              className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500 sm:w-auto"
                            >
                              พิมพ์เอกสาร
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openDocModal(job)}
                              disabled={actionDisabled || isDocGenerating}
                              className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                            >
                              {isDocGenerating
                                ? "กำลังสร้าง..."
                                : "สร้างเอกสารดับไฟ"}
                            </button>
                          )}
                        </>
                      )}
                      {showSocialButton ? (
                        <button
                          type="button"
                          onClick={() => setSocialJob(job)}
                          className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 sm:w-auto"
                        >
                          {socialStatus === "POSTED"
                            ? "Posted แล้วสื่อ Social"
                            : "รออนุมัติ"}
                        </button>
                      ) : null}
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

      <Modal
        isOpen={Boolean(docJob)}
        title="สร้างเอกสารดับไฟ"
        onClose={closeDocModal}
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            หนังสือลงวันที่
            <input
              type="date"
              value={docForm.doc_issue_date}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_issue_date: event.target.value
                }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
              required
            />
            {docErrors.doc_issue_date ? (
              <span className="text-xs text-red-600">
                {docErrors.doc_issue_date}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            ดับไฟเพื่อ
            <input
              type="text"
              value={docForm.doc_purpose}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_purpose: event.target.value
                }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
              required
            />
            {docErrors.doc_purpose ? (
              <span className="text-xs text-red-600">
                {docErrors.doc_purpose}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            บริเวณที่ดับ
            <input
              type="text"
              value={docForm.doc_area_title}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_area_title: event.target.value
                }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
              required
            />
            {docErrors.doc_area_title ? (
              <span className="text-xs text-red-600">
                {docErrors.doc_area_title}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            เวลาเริ่มดับไฟ
            <input
              type="time"
              value={docForm.doc_time_start}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_time_start: event.target.value
                }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
              required
            />
            {docErrors.doc_time_start ? (
              <span className="text-xs text-red-600">
                {docErrors.doc_time_start}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            เวลาจ่ายไฟ
            <input
              type="time"
              value={docForm.doc_time_end}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_time_end: event.target.value
                }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
              required
            />
            {docErrors.doc_time_end ? (
              <span className="text-xs text-red-600">
                {docErrors.doc_time_end}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            รายละเอียดพื้นที่ดับไฟ
            <textarea
              value={docForm.doc_area_detail}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_area_detail: event.target.value
                }))
              }
              rows={3}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
              required
            />
            {docErrors.doc_area_detail ? (
              <span className="text-xs text-red-600">
                {docErrors.doc_area_detail}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            ลิ้ง google map
            <input
              type="url"
              value={docForm.map_link}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  map_link: event.target.value
                }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
              required
            />
            {docErrors.map_link ? (
              <span className="text-xs text-red-600">
                {docErrors.map_link}
              </span>
            ) : null}
          </label>
          {docErrors.submit ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {docErrors.submit}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={closeDocModal}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleCreateDoc}
              disabled={docSaving}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {docSaving ? "กำลังสร้าง..." : "สร้าง"}
            </button>
          </div>
        </div>
      </Modal>

      <SocialPostPreviewModal
        job={socialJob}
        isOpen={Boolean(socialJob)}
        onClose={closeSocialModal}
        onJobUpdate={handleSocialJobUpdate}
      />
    </div>
  );
}
