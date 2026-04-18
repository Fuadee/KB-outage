"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import JobStatusStepper, { type JobStep } from "@/components/job/JobStatusStepper";
import MapActionButtons from "@/components/job/MapActionButtons";
import NoticeScheduleModal from "@/components/NoticeScheduleModal";
import Modal from "@/components/Modal";
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
import { getJob, OutageJob, updateJob } from "@/lib/jobsRepo";
import { supabase } from "@/lib/supabaseClient";
import { inputLight } from "@/lib/theme";

const textareaStyles = `${inputLight} min-h-[96px]`;

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
  const [workflowExpanded, setWorkflowExpanded] = useState(false);
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
  const isDocGenerated =
    job?.doc_status === "GENERATED" || Boolean(job?.doc_generated_at);
  const isUsersNotified = (job?.notice_status ?? "NONE") === "SCHEDULED";
  const workflowSteps: JobStep[] = [
    {
      id: "doc",
      label: "สร้างเอกสาร",
      state: isDocGenerated ? "done" : "current"
    },
    {
      id: "notify",
      label: "แจ้งผู้ใช้ไฟ",
      state: !isDocGenerated
        ? "locked"
        : isUsersNotified
          ? "done"
          : "current"
    },
    {
      id: "work",
      label: "ดำเนินงาน",
      state: !isUsersNotified
        ? "locked"
        : isClosed
          ? "done"
          : "current"
    },
    {
      id: "close",
      label: "ปิดงาน",
      state: isClosed ? "done" : isUsersNotified ? "current" : "locked"
    }
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Job detail
        </p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {isClosed ? "รายละเอียดงาน" : "แก้ไขงาน"}
            </h1>
            <p className="text-sm text-slate-200/80">
              {isClosed
                ? "งานนี้ถูกปิดแล้วและไม่สามารถแก้ไขได้"
                : "ปรับปรุงรายละเอียดหรือลบงานนี้ออกจากระบบ"}
            </p>
            {isClosed ? (
              <div className="text-sm text-slate-200/80">
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
          </div>
          <div className="flex flex-wrap gap-2">
            {job?.social_status === "POSTED" && !isClosed ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setNoticeOpen(true)}
              >
                {(job.notice_status ?? "NONE") === "SCHEDULED"
                  ? "กำหนดการแจ้งเรียบร้อยแล้ว (แก้ไขได้)"
                  : "แจ้งหนังสือดับไฟ"}
              </Button>
            ) : null}
            {canCloseJob ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setCloseError(null);
                  setCloseOpen(true);
                }}
              >
                ปิดงาน
              </Button>
            ) : null}
            <Badge variant={isClosed ? "neutral" : "accent"}>
              {isClosed ? "Closed" : "Active"}
            </Badge>
          </div>
        </div>
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
      </header>

      <Card>
        <CardHeader>
          <CardTitle>รายละเอียดงาน</CardTitle>
          <CardDescription>ข้อมูลพื้นฐานและหมายเหตุเพิ่มเติม</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="flex flex-col gap-6">
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-200/90">
              วันที่ดับไฟ
              <Input
                type="date"
                value={outageDate}
                onChange={(event) => setOutageDate(event.target.value)}
                disabled={isClosed}
                required
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-200/90">
              รหัสอุปกรณ์
              <Input
                type="text"
                value={equipmentCode}
                onChange={(event) => setEquipmentCode(event.target.value)}
                disabled={isClosed}
                required
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-200/90">
              หมายเหตุเพิ่มเติม
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                disabled={isClosed}
                className={textareaStyles}
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
                  <Button type="submit" disabled={saving}>
                    {saving ? "กำลังบันทึก..." : "บันทึก"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving}
                    onClick={handleDelete}
                    className="border-rose-200 text-rose-600 hover:bg-rose-50"
                  >
                    ลบงาน
                  </Button>
                </>
              ) : null}
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2 text-sm font-medium text-slate-200/90 shadow-sm transition hover:bg-slate-100"
              >
                กลับ
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Workflow</CardTitle>
              <CardDescription>สรุปขั้นตอนสำคัญแบบกระชับ</CardDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setWorkflowExpanded((prev) => !prev)}
            >
              {workflowExpanded ? "ซ่อนขั้นตอน" : "ดูขั้นตอน"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className={`${workflowExpanded ? "block" : "hidden"} md:block`}>
          <JobStatusStepper steps={workflowSteps} className="space-y-3" />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>ลิงก์แผนที่</CardTitle>
          <CardDescription>เข้าถึงแผนที่และจุดงาน</CardDescription>
        </CardHeader>
        <CardContent>
          <MapActionButtons
            googleUrl={job?.map_link}
            className="mt-3"
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Action bar</CardTitle>
          <CardDescription>การดำเนินการหลักของงานนี้</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {isDocGenerated ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (job?.doc_url) {
                  window.open(job.doc_url, "_blank", "noopener,noreferrer");
                }
              }}
              disabled={!job?.doc_url}
            >
              ดาวน์โหลดเอกสาร
            </Button>
          ) : (
            <Badge variant="neutral">ยังไม่มีเอกสารที่สร้างแล้ว</Badge>
          )}
          {job?.social_status === "POSTED" && !isClosed ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setNoticeOpen(true)}
            >
              {(job.notice_status ?? "NONE") === "SCHEDULED"
                ? "กำหนดการแจ้งเรียบร้อยแล้ว (แก้ไขได้)"
                : "แจ้งหนังสือดับไฟ"}
            </Button>
          ) : (
            <Badge variant="default">รอการโพสต์ Social</Badge>
          )}
          {canCloseJob ? (
            <Button
              type="button"
              onClick={() => {
                setCloseError(null);
                setCloseOpen(true);
              }}
            >
              ปิดงาน
            </Button>
          ) : (
            <Badge variant="neutral">ยังไม่พร้อมปิดงาน</Badge>
          )}
        </CardContent>
      </Card>

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
          <p className="text-sm text-slate-200/80">
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
              onClick={() => setCloseOpen(false)}
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
