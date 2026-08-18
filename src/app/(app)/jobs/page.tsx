"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import JobCard, { type JobAction } from "@/components/job/JobCard";
import type { JobStep } from "@/components/job/JobStatusStepper";
import Modal from "@/components/Modal";
import NoticeScheduleModal from "@/components/NoticeScheduleModal";
import SocialPostPreviewModal from "@/components/SocialPostPreviewModal";
import Button from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Segmented from "@/components/ui/Segmented";
import {
  listJobs,
  OutageJob,
  setNakhonNotified,
  setNakhonNotRequired
} from "@/lib/jobsRepo";
import { supabase } from "@/lib/supabaseClient";
import { AUTH_DISABLED } from "@/lib/authConfig";
import {
  CloseJobRequestError,
  closeOutageJob,
  normalizeJobId
} from "@/lib/closeJob";
import { inputLight } from "@/lib/theme";
import { getJobUrgency, parseLocalDate } from "@/lib/dateUtils";

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

type CloseTarget = {
  id: string;
  equipmentCode: string;
};
type VulnerablePatientPreview = {
  id: string;
  patient_name: string;
  contact_name: string | null;
  address: string | null;
  subdistrict: string | null;
  contact_phone: string | null;
  power_dependency_note: string | null;
  care_note: string | null;
  latitude: number | null;
  longitude: number | null;
};

type SpecialWatchlistPreview = {
  id: string;
  customer_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  subdistrict: string | null;
  impact_reason: string | null;
  care_note: string | null;
  latitude: number | null;
  longitude: number | null;
};

const isValidGoogleMapsUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    return (hostname.includes("google.") && pathname.includes("map")) || hostname === "maps.app.goo.gl";
  } catch {
    return false;
  }
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

const getWorkflowSteps = (job: OutageJob): JobStep[] => {
  const isDocGenerated =
    job.doc_status === "GENERATED" || Boolean(job.doc_generated_at);
  const socialStatus = job.social_status ?? "DRAFT";
  const noticeStatus = job.notice_status ?? "NONE";
  const isClosed = job.is_closed ?? false;

  return [
    {
      id: "doc",
      label: "สร้างเอกสาร",
      state: isDocGenerated ? "done" : "current"
    },
    {
      id: "social",
      label: "โพสต์ประชาสัมพันธ์",
      state: !isDocGenerated
        ? "locked"
        : socialStatus === "POSTED"
          ? "done"
          : socialStatus === "PENDING_APPROVAL"
            ? "current"
            : "pending"
    },
    {
      id: "notice",
      label: "แจ้งหนังสือดับไฟ",
      state:
        socialStatus !== "POSTED"
          ? "locked"
          : noticeStatus === "SCHEDULED"
            ? "done"
            : "current"
    },
    {
      id: "close",
      label: "ปิดงาน",
      state: isClosed
        ? "done"
        : noticeStatus === "SCHEDULED"
          ? "current"
          : "locked"
    }
  ];
};

const textareaStyles = `${inputLight} min-h-[96px]`;

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<OutageJob[]>([]);
  const [gisIssueCounts, setGisIssueCounts] = useState<Record<string, number>>({});
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
  const [closeTarget, setCloseTarget] = useState<CloseTarget | null>(null);
  const [vulnerableJob, setVulnerableJob] = useState<OutageJob | null>(null);
  const [vulnerablePatients, setVulnerablePatients] = useState<VulnerablePatientPreview[]>([]);
  const [vulnerableLoading, setVulnerableLoading] = useState(false);
  const [specialWatchlistJob, setSpecialWatchlistJob] = useState<OutageJob | null>(null);
  const [specialWatchlistCustomers, setSpecialWatchlistCustomers] = useState<SpecialWatchlistPreview[]>([]);
  const [specialWatchlistLoading, setSpecialWatchlistLoading] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const notifiedDateRef = useRef<HTMLInputElement>(null);
  const memoNoRef = useRef<HTMLInputElement>(null);
  const docIssueDateRef = useRef<HTMLInputElement>(null);
  const docPurposeRef = useRef<HTMLInputElement>(null);
  const docAreaTitleRef = useRef<HTMLInputElement>(null);
  const docTimeStartRef = useRef<HTMLInputElement>(null);
  const docTimeEndRef = useRef<HTMLInputElement>(null);
  const docAreaDetailRef = useRef<HTMLTextAreaElement>(null);
  const mapLinkRef = useRef<HTMLInputElement>(null);

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    setActionError(null);
    const { data, error: fetchError } = await listJobs();
    if (fetchError) {
      setError(fetchError.message);
      setJobs([]);
    } else {
      const nextJobs = data ?? [];
      setJobs(nextJobs);
      try {
        const countsResponse = await fetch("/api/gis-issues/job-counts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_ids: nextJobs.map((job) => job.id) })
        });
        const countsResult = await countsResponse.json().catch(() => null);
        if (countsResponse.ok && countsResult?.ok) {
          setGisIssueCounts(countsResult.data ?? {});
        }
      } catch (countsError) {
        console.warn("Unable to load GIS issue counts", countsError);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!selectedJob) return;
    window.setTimeout(() => {
      notifiedDateRef.current?.focus();
    }, 0);
  }, [selectedJob]);

  useEffect(() => {
    if (!docJob) return;
    window.setTimeout(() => {
      docIssueDateRef.current?.focus();
    }, 0);
  }, [docJob]);

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
    const jobId = normalizeJobId(job.id);
    if (!jobId) {
      setToast({ message: "รหัสงานไม่ถูกต้อง ไม่สามารถเปิดหน้าต่างปิดงานได้", tone: "error" });
      return;
    }

    setCloseTarget({ id: jobId, equipmentCode: job.equipment_code });
    setCloseSaving(false);
    setCloseError(null);
  };
  const openSpecialWatchlistModal = async (job: OutageJob) => {
    const ids = Array.isArray(job.special_watchlist_customer_ids)
      ? job.special_watchlist_customer_ids
      : [];
    setSpecialWatchlistJob(job);
    setSpecialWatchlistCustomers([]);

    if (ids.length === 0) {
      return;
    }

    setSpecialWatchlistLoading(true);
    try {
      const params = new URLSearchParams({ ids: ids.join(",") });
      const response = await fetch(`/api/special-watchlist/by-ids?${params.toString()}`);
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "ไม่สามารถโหลดรายละเอียดกลุ่มเฝ้าระวังพิเศษได้");
      }

      setSpecialWatchlistCustomers(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถโหลดรายละเอียดกลุ่มเฝ้าระวังพิเศษได้";
      setToast({ message, tone: "error" });
      setSpecialWatchlistCustomers([]);
    } finally {
      setSpecialWatchlistLoading(false);
    }
  };

  const openVulnerableModal = async (job: OutageJob) => {
    const ids = Array.isArray(job.vulnerable_patient_ids) ? job.vulnerable_patient_ids : [];
    setVulnerableJob(job);
    setVulnerablePatients([]);

    if (ids.length === 0) {
      return;
    }

    setVulnerableLoading(true);
    try {
      const params = new URLSearchParams({ ids: ids.join(",") });
      const response = await fetch(`/api/bedridden-patients/by-ids?${params.toString()}`);
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "ไม่สามารถโหลดรายละเอียดผู้ป่วยได้");
      }

      setVulnerablePatients(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถโหลดรายละเอียดผู้ป่วยได้";
      setToast({ message, tone: "error" });
      setVulnerablePatients([]);
    } finally {
      setVulnerableLoading(false);
    }
  };

  const handleRecheckImpactGroups = async (job: OutageJob) => {
    const key = `impact-groups:${job.id}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    setActionError(null);
    try {
      const response = await fetch(
        `/api/jobs/${job.id}/check-impact-groups`,
        { method: "POST" }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "ไม่สามารถตรวจสอบกลุ่มผลกระทบได้");
      }
      await fetchJobs();
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "ไม่สามารถตรวจสอบกลุ่มผลกระทบได้"
      );
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleCloseJob = async (jobId: string) => {
    setCloseSaving(true);
    setCloseError(null);

    if (!AUTH_DISABLED) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setCloseSaving(false);
        setCloseTarget(null);
        router.push("/login");
        return;
      }
    }

    try {
      const result = await closeOutageJob(jobId);

      setToast({ message: "✅ ปิดงานเรียบร้อย", tone: "success" });
      setJobs((prev) =>
        prev.map((job) =>
          job.id === result.jobId
            ? {
                ...job,
                is_closed: true,
                closed_at: result.closed_at ?? new Date().toISOString()
              }
            : job
        )
      );
      setCloseTarget(null);
      await fetchJobs();
    } catch (closeError) {
      if (
        !AUTH_DISABLED &&
        closeError instanceof CloseJobRequestError &&
        closeError.status === 401
      ) {
        setCloseTarget(null);
        router.push("/login");
        return;
      }

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
      const firstErrorRef = nextErrors.date ? notifiedDateRef : memoNoRef;
      firstErrorRef.current?.focus();
      firstErrorRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth"
      });
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
      nextErrors.map_link = "กรุณาระบุตำแหน่ง Google Map";
    } else if (!isValidGoogleMapsUrl(docForm.map_link)) {
      nextErrors.map_link = "กรุณาใส่ลิงก์ Google Map ที่ถูกต้อง";
    }

    if (Object.keys(nextErrors).length > 0) {
      setDocErrors(nextErrors);
      const firstErrorField = (
        [
          "doc_issue_date",
          "doc_purpose",
          "doc_area_title",
          "doc_time_start",
          "doc_time_end",
          "doc_area_detail",
          "map_link"
        ] as const
      ).find((field) => nextErrors[field]);
      const fieldRefMap: Record<
        keyof DocForm,
        RefObject<HTMLInputElement> | RefObject<HTMLTextAreaElement>
      > = {
        doc_issue_date: docIssueDateRef,
        doc_purpose: docPurposeRef,
        doc_area_title: docAreaTitleRef,
        doc_time_start: docTimeStartRef,
        doc_time_end: docTimeEndRef,
        doc_area_detail: docAreaDetailRef,
        map_link: mapLinkRef
      };
      if (firstErrorField) {
        const ref = fieldRefMap[firstErrorField];
        ref.current?.focus();
        ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
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

  const handleNotifiedFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSubmitNotified();
  };

  const handleCreateDocFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleCreateDoc();
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1 pb-1">
        <p className="page-eyebrow">Outage operations</p>
        <h1 className="page-title">Jobs</h1>
        <p className="page-description">
          ศูนย์ควบคุมติดตามงานดับไฟ แสดงสถานะงานและขั้นตอนถัดไปของแต่ละใบงาน
        </p>
      </header>

      <section className="rounded-[12px] border border-slate-200/80 bg-white/75 px-4 py-3.5">
          <div className="grid gap-3 lg:grid-cols-[minmax(320px,1fr)_auto_auto] lg:items-end">
            <div className="flex w-full flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600">
                ค้นหาอุปกรณ์
              </label>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="กรอกรหัสอุปกรณ์"
                className="h-10"
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
            <Segmented
              options={[
                { id: "active", label: "ดำเนินการ" },
                { id: "closed", label: "ปิดแล้ว" }
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
      </section>

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

      <section className="grid gap-3">
        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              กำลังโหลดข้อมูล...
            </CardContent>
          </Card>
        ) : filteredJobs.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              ยังไม่มีงานที่ตรงกับตัวกรอง
            </CardContent>
          </Card>
        ) : (
          filteredJobs.map((job) => {
            const urgency = getJobUrgency(job);
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
            const workflowSteps = getWorkflowSteps(job);
            const secondaryActions: JobAction[] = [];
            const tertiaryItems: string[] = [];
            const vulnerableStatus = job.vulnerable_check_status ?? null;
            let primaryAction: JobAction | undefined;

            if (isPending) {
              secondaryActions.push({
                id: "not_required",
                label: actionDisabled ? "กำลังบันทึก..." : "ไม่ต้องแจ้งศูนย์นคร",
                onClick: () => handleNotRequired(job),
                disabled: actionDisabled
              });
            } else if (isDocGenerated) {
              secondaryActions.push({
                id: "create_doc",
                label: job.doc_url ? "พิมพ์เอกสาร" : "ดาวน์โหลดเอกสารอีกครั้ง",
                onClick: () => {
                  if (job.doc_url) {
                    window.open(job.doc_url, "_blank", "noopener,noreferrer");
                    return;
                  }
                  openDocModal(job);
                }
              });
            } else {
              secondaryActions.push({
                id: "create_doc",
                label: isDocGenerating ? "กำลังสร้าง..." : "สร้างเอกสารดับไฟ",
                onClick: () => openDocModal(job),
                disabled: actionDisabled || isDocGenerating
              });
            }

            if (showSocialButton) {
              secondaryActions.push({
                id: "wait_approval",
                label:
                  socialStatus === "POSTED"
                    ? "Posted แล้วสื่อ Social"
                    : "รออนุมัติ",
                onClick: () => setSocialJob(job)
              });
            }

            if (showNoticeButton) {
              secondaryActions.push({
                id: "notify_outage_letter",
                label:
                  noticeStatus === "SCHEDULED"
                    ? "แก้ไขกำหนดการแจ้งหนังสือ"
                    : "แจ้งหนังสือดับไฟ",
                onClick: () => setNoticeJob(job)
              });
            }

            if (canCloseJob) {
              secondaryActions.push({
                id: "close_job",
                label: "ปิดงาน",
                onClick: () => openCloseModal(job)
              });
            }

            primaryAction = {
              id: nextAction,
              label:
                nextAction === "wait_approval" && socialStatus === "POSTED"
                  ? "Posted แล้วสื่อ Social"
                  : nextAction === "notify_outage_letter" &&
                      noticeStatus === "SCHEDULED"
                    ? "กำหนดการแจ้งเรียบร้อยแล้ว"
                    : actionLabelMap[nextAction],
              onClick: () => {
                if (nextAction === "notify_nakhon") return openNotifiedModal(job);
                if (nextAction === "create_doc") {
                  if (isDocGenerated && job.doc_url) {
                    window.open(job.doc_url, "_blank", "noopener,noreferrer");
                    return;
                  }
                  return openDocModal(job);
                }
                if (nextAction === "wait_approval") return setSocialJob(job);
                if (nextAction === "notify_outage_letter") return setNoticeJob(job);
                return openCloseModal(job);
              },
              disabled: nextAction === "create_doc" && (actionDisabled || isDocGenerating)
            };

            const displaySecondaryActions = secondaryActions.filter(
              (item) => item.id !== nextAction
            );

            if (isNotified) {
              tertiaryItems.push(
                `แจ้งศูนย์นคร ${job.nakhon_notified_date ?? "-"} / เลขที่ ${job.nakhon_memo_no ?? "-"}`
              );
            }
            if (isNotRequired) tertiaryItems.push("ไม่ต้องแจ้งศูนย์นคร");
            if (socialStatus === "POSTED") tertiaryItems.push("โพสต์ Social แล้ว");
            if (noticeStatus === "SCHEDULED") tertiaryItems.push("กำหนดการแจ้งเรียบร้อยแล้ว");

            return (
              <JobCard
                key={job.id}
                job={job}
                urgency={urgency}
                stepper={workflowSteps}
                nextActionLabel={nextActionLabel}
                primaryAction={isClosed ? undefined : primaryAction}
                secondaryActions={displaySecondaryActions}
                tertiaryItems={tertiaryItems}
                vulnerableCheckStatus={vulnerableStatus}
                vulnerableCheckCount={job.vulnerable_check_count}
                vulnerableCheckedAt={job.vulnerable_check_checked_at}
                vulnerableCheckError={job.vulnerable_check_error}
                specialWatchlistCheckStatus={job.special_watchlist_check_status}
                specialWatchlistCheckCount={job.special_watchlist_check_count}
                specialWatchlistCheckedAt={job.special_watchlist_check_checked_at}
                specialWatchlistCheckError={job.special_watchlist_check_error}
                canOpenSpecialWatchlist={job.special_watchlist_check_status === "FOUND_IN_POLYGON"}
                onOpenSpecialWatchlist={() => openSpecialWatchlistModal(job)}
                canOpenVulnerableList={vulnerableStatus === "FOUND_IN_POLYGON"}
                onOpenVulnerableList={() => openVulnerableModal(job)}
                impactGroupsChecking={actionLoading[`impact-groups:${job.id}`] ?? false}
                onRecheckImpactGroups={() => handleRecheckImpactGroups(job)}
                gisIssueCount={gisIssueCounts[job.id] ?? 0}
                onReportGisIssue={() => router.push(`/gis-issues/new?source_job_id=${job.id}`)}
                onOpenGisIssues={() => router.push(`/gis-issues?source_job_id=${job.id}`)}
                onOpenDetail={() => router.push(`/job/${job.id}`)}
              />
            );
          })
        )}
      </section>

      <Modal
        isOpen={Boolean(selectedJob)}
        title="แจ้งศูนย์นครแล้ว"
        onClose={closeModal}
        onSubmit={handleNotifiedFormSubmit}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={modalSaving}>
              {modalSaving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
            วันที่แจ้งศูนย์นคร
            <Input
              ref={notifiedDateRef}
              type="date"
              value={notifiedDate}
              onChange={(event) => setNotifiedDate(event.target.value)}
              className="h-10"
              required
            />
            {modalErrors.date ? (
              <span className="text-xs text-red-600">{modalErrors.date}</span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
            เลขที่บันทึก
            <Input
              ref={memoNoRef}
              type="text"
              value={memoNo}
              onChange={(event) => setMemoNo(event.target.value)}
              className="h-10"
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
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(docJob)}
        title="สร้างเอกสารดับไฟ"
        onClose={closeDocModal}
        onSubmit={handleCreateDocFormSubmit}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeDocModal}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={docSaving}>
              {docSaving ? "กำลังสร้าง..." : "บันทึก"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
            หนังสือลงวันที่
            <Input
              ref={docIssueDateRef}
              type="date"
              value={docForm.doc_issue_date}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_issue_date: event.target.value
                }))
              }
              className="h-10"
              required
            />
            {docErrors.doc_issue_date ? (
              <span className="text-xs text-red-600">
                {docErrors.doc_issue_date}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
            ดับไฟเพื่อ
            <Input
              ref={docPurposeRef}
              type="text"
              value={docForm.doc_purpose}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_purpose: event.target.value
                }))
              }
              className="h-10"
              required
            />
            {docErrors.doc_purpose ? (
              <span className="text-xs text-red-600">
                {docErrors.doc_purpose}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
            บริเวณที่ดับ
            <Input
              ref={docAreaTitleRef}
              type="text"
              value={docForm.doc_area_title}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_area_title: event.target.value
                }))
              }
              className="h-10"
              required
            />
            {docErrors.doc_area_title ? (
              <span className="text-xs text-red-600">
                {docErrors.doc_area_title}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
            เวลาเริ่มดับไฟ
            <Input
              ref={docTimeStartRef}
              type="time"
              value={docForm.doc_time_start}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_time_start: event.target.value
                }))
              }
              className="h-10"
              required
            />
            {docErrors.doc_time_start ? (
              <span className="text-xs text-red-600">
                {docErrors.doc_time_start}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
            เวลาจ่ายไฟ
            <Input
              ref={docTimeEndRef}
              type="time"
              value={docForm.doc_time_end}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_time_end: event.target.value
                }))
              }
              className="h-10"
              required
            />
            {docErrors.doc_time_end ? (
              <span className="text-xs text-red-600">
                {docErrors.doc_time_end}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700 md:col-span-2">
            รายละเอียดพื้นที่ดับไฟ
            <textarea
              ref={docAreaDetailRef}
              value={docForm.doc_area_detail}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  doc_area_detail: event.target.value
                }))
              }
              rows={3}
              className={`${textareaStyles} min-h-[84px]`}
              required
            />
            {docErrors.doc_area_detail ? (
              <span className="text-xs text-red-600">
                {docErrors.doc_area_detail}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700 md:col-span-2">
            ตำแหน่งสถานที่ (Google Map)
            <Input
              ref={mapLinkRef}
              type="url"
              value={docForm.map_link}
              onChange={(event) =>
                setDocForm((prev) => ({
                  ...prev,
                  map_link: event.target.value
                }))
              }
              className="h-10"
              placeholder="https://maps.google.com/..."
              required
            />
            {docErrors.map_link ? (
              <span className="text-xs text-red-600">
                {docErrors.map_link}
              </span>
            ) : null}
          </label>
          {docErrors.submit ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">
              {docErrors.submit}
            </div>
          ) : null}
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
        isOpen={Boolean(vulnerableJob)}
        title="รายชื่อผู้ป่วยในพื้นที่ดับไฟ"
        onClose={() => {
          setVulnerableJob(null);
          setVulnerablePatients([]);
          setVulnerableLoading(false);
        }}
      >
        <div className="space-y-2">
          {vulnerableLoading ? <p className="text-sm text-slate-600">กำลังโหลดรายชื่อผู้ป่วย...</p> : null}
          {!vulnerableLoading && vulnerablePatients.length === 0 ? (
            <p className="text-sm text-slate-600">ไม่พบรายละเอียดผู้ป่วย</p>
          ) : null}
          {!vulnerableLoading
            ? vulnerablePatients.map((patient) => (
                <div key={patient.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p className="font-semibold">{patient.patient_name}</p>
                  <p>พื้นที่/ที่อยู่ย่อ: {patient.subdistrict || patient.address || "-"}</p>
                  <p>ผู้ประสาน: {patient.contact_name || "-"} {patient.contact_phone ? `(${patient.contact_phone})` : ""}</p>
                  <p>หมายเหตุไฟฟ้าจำเป็น: {patient.power_dependency_note || "-"}</p>
                  {typeof patient.latitude === "number" && typeof patient.longitude === "number" ? (
                    <a
                      href={`https://www.google.com/maps?q=${patient.latitude},${patient.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex underline underline-offset-2"
                    >
                      เปิดแผนที่
                    </a>
                  ) : null}
                </div>
              ))
            : null}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(specialWatchlistJob)}
        title="รายชื่อกลุ่มเฝ้าระวังพิเศษในพื้นที่ดับไฟ"
        onClose={() => {
          setSpecialWatchlistJob(null);
          setSpecialWatchlistCustomers([]);
          setSpecialWatchlistLoading(false);
        }}
      >
        <div className="space-y-2">
          {specialWatchlistLoading ? <p className="text-sm text-slate-600">กำลังโหลดรายชื่อกลุ่มเฝ้าระวังพิเศษ...</p> : null}
          {!specialWatchlistLoading && specialWatchlistCustomers.length === 0 ? (
            <p className="text-sm text-slate-600">ไม่พบรายละเอียดกลุ่มเฝ้าระวังพิเศษ</p>
          ) : null}
          {!specialWatchlistLoading
            ? specialWatchlistCustomers.map((customer) => (
                <div key={customer.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p className="font-semibold">{customer.customer_name}</p>
                  <p>พื้นที่/ที่อยู่: {customer.subdistrict || customer.address || "-"}</p>
                  <p>ผู้ประสาน: {customer.contact_name || "-"} {customer.contact_phone ? `(${customer.contact_phone})` : ""}</p>
                  <p>เหตุผลที่ต้องเฝ้าระวัง: {customer.impact_reason || "-"}</p>
                  <p>หมายเหตุการดูแล: {customer.care_note || "-"}</p>
                  {typeof customer.latitude === "number" && typeof customer.longitude === "number" ? (
                    <a
                      href={`https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex underline underline-offset-2"
                    >
                      เปิดแผนที่
                    </a>
                  ) : null}
                </div>
              ))
            : null}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(closeTarget)}
        title="ยืนยันปิดงาน?"
        onClose={() => {
          if (!closeSaving) setCloseTarget(null);
        }}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            ปิดงานแล้วจะถูกย้ายไปที่ &quot;งานที่ปิดแล้ว&quot;
            และไม่สามารถแก้ไขได้
          </p>
          {closeTarget ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
              งาน {closeTarget.equipmentCode}
            </p>
          ) : null}
          {closeError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {closeError}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCloseTarget(null)}
              disabled={closeSaving}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (closeTarget) void handleCloseJob(closeTarget.id);
              }}
              disabled={closeSaving || !closeTarget}
            >
              {closeSaving ? "กำลังปิดงาน..." : "ยืนยันปิดงาน"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
