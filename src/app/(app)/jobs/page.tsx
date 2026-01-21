"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import MapActionButtons from "@/components/job/MapActionButtons";
import Modal from "@/components/Modal";
import NoticeScheduleModal from "@/components/NoticeScheduleModal";
import SocialPostPreviewModal from "@/components/SocialPostPreviewModal";
import StatusBadge from "@/components/StatusBadge";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Segmented from "@/components/ui/Segmented";
import {
  listJobs,
  OutageJob,
  setNakhonNotified,
  setNakhonNotRequired
} from "@/lib/jobsRepo";
import { supabase } from "@/lib/supabaseClient";
import {
  getJobUrgency,
  getUrgencyStyles,
  parseLocalDate
} from "@/lib/dateUtils";

type FilterOption = "all" | "green" | "yellow" | "red";
type TabOption = "active" | "closed";
type ActionKey =
  | "notify_nakhon"
  | "create_doc"
  | "wait_approval"
  | "notify_outage_letter"
  | "close_job";

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

const getNextAction = (job: OutageJob): ActionKey => {
  const nakhonStatus = job.nakhon_status ?? "PENDING";
  if (nakhonStatus === "PENDING") {
    return "notify_nakhon";
  }

  const isDocGenerated =
    job.doc_status === "GENERATED" || Boolean(job.doc_generated_at);
  if (!isDocGenerated) {
    return "create_doc";
  }

  const socialStatus = job.social_status ?? "DRAFT";
  if (socialStatus === "PENDING_APPROVAL") {
    return "wait_approval";
  }

  const noticeStatus = job.notice_status ?? "NONE";
  if (socialStatus === "POSTED" && noticeStatus !== "SCHEDULED") {
    return "notify_outage_letter";
  }

  return "close_job";
};

const actionLabelMap: Record<ActionKey, string> = {
  notify_nakhon: "แจ้งศูนย์นคร",
  create_doc: "สร้างเอกสารดับไฟ",
  wait_approval: "รออนุมัติ",
  notify_outage_letter: "แจ้งหนังสือดับไฟ",
  close_job: "ปิดงาน"
};

const actionButtonVariant = (isPrimary: boolean) =>
  isPrimary ? "primary" : "secondary";
const textareaStyles =
  "w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200";

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<OutageJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [tab, setTab] = useState<TabOption>("active");
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
  const [noticeJob, setNoticeJob] = useState<OutageJob | null>(null);
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
  const [closeJob, setCloseJob] = useState<OutageJob | null>(null);
  const [closeSaving, setCloseSaving] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

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

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? null);
    };

    loadUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserEmail(session?.user?.email ?? null);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

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

  const closeNoticeModal = () => {
    setNoticeJob(null);
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

  const openCloseModal = (job: OutageJob) => {
    setCloseJob(job);
    setCloseSaving(false);
    setCloseError(null);
  };

  const handleCloseJob = async () => {
    if (!closeJob) return;
    setCloseSaving(true);
    setCloseError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setCloseSaving(false);
      setCloseJob(null);
      router.push("/login");
      return;
    }

    try {
      const response = await fetch(`/api/jobs/${closeJob.id}/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (response.status === 401) {
        setCloseSaving(false);
        setCloseJob(null);
        router.push("/login");
        return;
      }
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "ปิดงานไม่สำเร็จ กรุณาลองใหม่");
      }

      setToast({ message: "✅ ปิดงานเรียบร้อย", tone: "success" });
      await fetchJobs();
      setCloseJob(null);
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    await fetch("/api/auth/session", { method: "DELETE" });
    router.push("/login");
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
      .filter((job) =>
        tab === "closed" ? job.is_closed : !job.is_closed
      )
      .filter((job) => {
        if (!normalizedQuery) return true;
        return job.equipment_code.toLowerCase().includes(normalizedQuery);
      })
      .filter((job) => {
        if (filter === "all") return true;
        const urgency = getJobUrgency(job);
        return urgency.color.toLowerCase() === filter;
      })
      .sort((a, b) => {
        if (tab === "closed") {
          const aClosed = a.closed_at ? new Date(a.closed_at).getTime() : 0;
          const bClosed = b.closed_at ? new Date(b.closed_at).getTime() : 0;
          return bClosed - aClosed;
        }
        return (
          parseLocalDate(a.outage_date).getTime() -
          parseLocalDate(b.outage_date).getTime()
        );
      });
  }, [jobs, query, filter, tab]);

  const handleSocialJobUpdate = (
    jobId: string,
    patch: Partial<OutageJob>
  ) => {
    setJobs((prev) => {
      const nextJobs = prev.map((item) =>
        item.id === jobId ? { ...item, ...patch } : item
      );
      if (process.env.NODE_ENV === "development") {
        const updatedJob = nextJobs.find((item) => item.id === jobId);
        if (updatedJob) {
          console.log("Updated job fields:", {
            jobId,
            social_status: updatedJob.social_status,
            notice_status: updatedJob.notice_status
          });
        }
      }
      return nextJobs;
    });
    setSocialJob((prev) =>
      prev?.id === jobId ? { ...prev, ...patch } : prev
    );
  };

  const handleNoticeJobUpdate = (
    jobId: string,
    patch: Partial<OutageJob>
  ) => {
    setJobs((prev) =>
      prev.map((item) => (item.id === jobId ? { ...item, ...patch } : item))
    );
    setNoticeJob((prev) =>
      prev?.id === jobId ? { ...prev, ...patch } : prev
    );
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white/80">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Jobs
              </p>
              <CardTitle>Krabi Outage Tracker</CardTitle>
              <CardDescription>
                ติดตามงานดับไฟตามกำหนดและสถานะวันคงเหลือ
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {userEmail ? <Badge variant="neutral">{userEmail}</Badge> : null}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleLogout}
              >
                ออกจากระบบ
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex w-full max-w-md flex-col gap-2">
              <label className="text-sm font-medium text-slate-600">
                ค้นหาอุปกรณ์
              </label>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="กรอกรหัสอุปกรณ์"
              />
            </div>
            <Segmented
              options={[
                { id: "all", label: "ทั้งหมด" },
                { id: "green", label: "เขียว" },
                { id: "yellow", label: "เหลือง" },
                { id: "red", label: "แดง" }
              ]}
              value={filter}
              onChange={setFilter}
            />
          </div>
          <Segmented
            options={[
              { id: "active", label: "กำลังดำเนินการ" },
              { id: "closed", label: "ปิดแล้ว" }
            ]}
            value={tab}
            onChange={setTab}
          />
        </CardContent>
      </Card>

      {toast ? (
        <Card
          className={`${
            toast.tone === "success"
              ? "border-emerald-200 bg-emerald-50/80"
              : "border-rose-200 bg-rose-50/80"
          }`}
        >
          <CardContent
            className={`py-3 text-sm ${
              toast.tone === "success"
                ? "text-emerald-700"
                : "text-rose-700"
            }`}
          >
            {toast.message}
          </CardContent>
        </Card>
      ) : null}
      {error ? (
        <Card className="border-rose-200 bg-rose-50/80">
          <CardContent className="py-3 text-sm text-rose-700">
            {error}
          </CardContent>
        </Card>
      ) : null}
      {actionError ? (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardContent className="py-3 text-sm text-amber-700">
            {actionError}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4">
        {loading ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              กำลังโหลดข้อมูล...
            </CardContent>
          </Card>
        ) : filteredJobs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              ยังไม่มีงานที่ตรงกับตัวกรอง
            </CardContent>
          </Card>
        ) : (
          filteredJobs.map((job) => {
            const urgency = getJobUrgency(job);
            const status = getUrgencyStyles(urgency.color);
            const nakhonStatus = job.nakhon_status ?? "PENDING";
            const isPending = nakhonStatus === "PENDING";
            const isNotified = nakhonStatus === "NOTIFIED";
            const isNotRequired = nakhonStatus === "NOT_REQUIRED";
            const actionDisabled = actionLoading[job.id] ?? false;
            const isClosed = job.is_closed ?? false;
            const isDocGenerated =
              job.doc_status === "GENERATED" || Boolean(job.doc_generated_at);
            const isDocGenerating = job.doc_status === "GENERATING";
            const socialStatus = job.social_status ?? "DRAFT";
            const noticeStatus = job.notice_status ?? "NONE";
            const showSocialButton =
              socialStatus === "PENDING_APPROVAL" || socialStatus === "POSTED";
            const showNoticeButton = socialStatus === "POSTED";
            const canCloseJob = noticeStatus === "SCHEDULED" && !isClosed;
            const nextAction = getNextAction(job);
            const nextActionLabel = actionLabelMap[nextAction];
            const isPrimaryAction = (actionKey: ActionKey) =>
              actionKey === nextAction;
            return (
              <Card
                key={job.id}
                className="group flex items-stretch overflow-hidden transition hover:-translate-y-0.5"
              >
                <div className={`w-1.5 ${status.strip}`} />
                <div className="flex w-full flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-[240px] flex-1 flex-col gap-4">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/job/${job.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/job/${job.id}`);
                        }
                      }}
                      className="cursor-pointer space-y-4 rounded-2xl outline-none transition focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
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
                        <StatusBadge
                          status={urgency.color}
                          label={urgency.color}
                        />
                      </div>
                      {isClosed ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                          <Badge variant="neutral">ปิดแล้ว</Badge>
                          <span>
                            ปิดเมื่อ{" "}
                            {job.closed_at
                              ? new Date(job.closed_at).toLocaleString(
                                  "th-TH",
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  }
                                )
                              : "-"}
                          </span>
                        </div>
                      ) : null}
                      <div className="space-y-1">
                        <p className="text-lg font-semibold tracking-tight text-slate-900">
                          {job.equipment_code}
                        </p>
                        <p className="text-sm text-slate-600">
                          {job.note?.trim() || "ไม่มีหมายเหตุ"}
                        </p>
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
                    <MapActionButtons
                      googleUrl={job.map_link}
                      myMapUrl={job.mymaps_url}
                    />
                  </div>

                  {!isClosed ? (
                    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:min-w-[220px]">
                      <div className="text-xs font-medium text-slate-500">
                        ขั้นตอนถัดไป:{" "}
                        <span className="text-slate-700">
                          {nextActionLabel}
                        </span>
                      </div>
                      {isPending ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant={actionButtonVariant(
                              isPrimaryAction("notify_nakhon")
                            )}
                            className="w-full"
                            onClick={() => openNotifiedModal(job)}
                          >
                            แจ้งศูนย์นครแล้ว
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            onClick={() => handleNotRequired(job)}
                            disabled={actionDisabled}
                          >
                            {actionDisabled
                              ? "กำลังบันทึก..."
                              : "ไม่ต้องแจ้งศูนย์นคร"}
                          </Button>
                        </>
                      ) : (
                        <>
                          {isDocGenerated ? (
                            job.doc_url ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={actionButtonVariant(
                                  isPrimaryAction("create_doc")
                                )}
                                className="w-full"
                                onClick={() => {
                                  if (job.doc_url) {
                                    window.open(
                                      job.doc_url,
                                      "_blank",
                                      "noopener,noreferrer"
                                    );
                                    return;
                                  }
                                  openDocModal(job);
                                }}
                              >
                                พิมพ์เอกสาร
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="w-full"
                                onClick={() => openDocModal(job)}
                              >
                                ดาวน์โหลดเอกสารอีกครั้ง
                              </Button>
                            )
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant={actionButtonVariant(
                                isPrimaryAction("create_doc")
                              )}
                              className="w-full"
                              onClick={() => openDocModal(job)}
                              disabled={actionDisabled || isDocGenerating}
                            >
                              {isDocGenerating
                                ? "กำลังสร้าง..."
                                : "สร้างเอกสารดับไฟ"}
                            </Button>
                          )}
                        </>
                      )}
                      {showSocialButton ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={actionButtonVariant(
                            isPrimaryAction("wait_approval")
                          )}
                          className="w-full"
                          onClick={() => setSocialJob(job)}
                        >
                          {socialStatus === "POSTED"
                            ? "Posted แล้วสื่อ Social"
                            : "รออนุมัติ"}
                        </Button>
                      ) : null}
                      {showNoticeButton ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={actionButtonVariant(
                            isPrimaryAction("notify_outage_letter")
                          )}
                          className="w-full"
                          onClick={() => setNoticeJob(job)}
                        >
                          {noticeStatus === "SCHEDULED"
                            ? "กำหนดการแจ้งเรียบร้อยแล้ว (แก้ไขได้)"
                            : "แจ้งหนังสือดับไฟ"}
                        </Button>
                      ) : null}
                      {canCloseJob ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={actionButtonVariant(
                            isPrimaryAction("close_job")
                          )}
                          className="w-full"
                          onClick={() => openCloseModal(job)}
                        >
                          ปิดงาน
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Card>
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
            <Input
              type="date"
              value={notifiedDate}
              onChange={(event) => setNotifiedDate(event.target.value)}
              required
            />
            {modalErrors.date ? (
              <span className="text-xs text-red-600">{modalErrors.date}</span>
            ) : null}
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            เลขที่บันทึก
            <Input
              type="text"
              value={memoNo}
              onChange={(event) => setMemoNo(event.target.value)}
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
            <Button type="button" variant="secondary" onClick={closeModal}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={handleSubmitNotified}
              disabled={modalSaving}
            >
              {modalSaving ? "กำลังบันทึก..." : "ตกลง"}
            </Button>
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
            <Input
              type="date"
              value={docForm.doc_issue_date}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_issue_date: event.target.value
                }))
              }
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
            <Input
              type="text"
              value={docForm.doc_purpose}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_purpose: event.target.value
                }))
              }
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
            <Input
              type="text"
              value={docForm.doc_area_title}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_area_title: event.target.value
                }))
              }
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
            <Input
              type="time"
              value={docForm.doc_time_start}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_time_start: event.target.value
                }))
              }
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
            <Input
              type="time"
              value={docForm.doc_time_end}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_time_end: event.target.value
                }))
              }
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
              className={textareaStyles}
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
            <Input
              type="url"
              value={docForm.map_link}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  map_link: event.target.value
                }))
              }
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
            <Button type="button" variant="secondary" onClick={closeDocModal}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={handleCreateDoc}
              disabled={docSaving}
            >
              {docSaving ? "กำลังสร้าง..." : "สร้าง"}
            </Button>
          </div>
        </div>
      </Modal>

      <SocialPostPreviewModal
        job={socialJob}
        isOpen={Boolean(socialJob)}
        onClose={closeSocialModal}
        onJobUpdate={handleSocialJobUpdate}
      />

      <NoticeScheduleModal
        job={noticeJob}
        open={Boolean(noticeJob)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeNoticeModal();
          }
        }}
        onJobUpdate={handleNoticeJobUpdate}
      />

      <Modal
        isOpen={Boolean(closeJob)}
        title="ยืนยันปิดงาน?"
        onClose={() => setCloseJob(null)}
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCloseJob(null)}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={handleCloseJob}
              disabled={closeSaving}
            >
              {closeSaving ? "กำลังปิดงาน..." : "ยืนยันปิดงาน"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
