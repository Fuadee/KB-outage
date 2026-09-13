"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import MapActionButtons from "@/components/job/MapActionButtons";
import DocumentWorkflowModal, {
  type DocumentWorkflowModalMode
} from "@/components/job/DocumentWorkflowModal";
import DocumentWorkflowPanel from "@/components/job/DocumentWorkflowPanel";
import WorkflowAuditHistory from "@/components/job/WorkflowAuditHistory";
import WorkflowRollbackModal from "@/components/job/WorkflowRollbackModal";
import NoticeScheduleModal from "@/components/NoticeScheduleModal";
import SocialPostPreviewModal from "@/components/SocialPostPreviewModal";
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
import SwitchingField from "@/components/job/SwitchingField";
import PersonSelect from "@/components/people/PersonSelect";
import { getJob, OutageJob, updateJob } from "@/lib/jobsRepo";
import {
  formatCustomerCount,
  AONANG_RESPONSIBLE_UNIT,
  isResponsibleUnit,
  MAX_CUSTOMER_COUNT,
  parseCustomerCount,
  RESPONSIBLE_UNITS,
  type ResponsibleUnit
} from "@/lib/jobMetadata";
import {
  getPersonReference,
  isWorkSupervisorDepartmentEligible,
  type PersonReference
} from "@/lib/people";
import {
  closeOutageJob,
  normalizeJobId
} from "@/lib/closeJob";
import { inputLight } from "@/lib/theme";
import {
  getDocumentWorkflowAction,
  getDocumentWorkflowActionLabel,
  isNoticeCompleted,
  isNoticeScheduled
} from "@/lib/documentWorkflow";
import { getDistributionWorkflow } from "@/lib/distributionWorkflow";

const textareaStyles = `${inputLight} min-h-[96px]`;

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const routeJobId = normalizeJobId(params.id);
  const [outageDate, setOutageDate] = useState("");
  const [equipmentCode, setEquipmentCode] = useState("");
  const [responsibleUnit, setResponsibleUnit] = useState<ResponsibleUnit | "">("");
  const [workSupervisorPerson, setWorkSupervisorPerson] =
    useState<PersonReference | null>(null);
  const [legacyWorkSupervisorName, setLegacyWorkSupervisorName] =
    useState<string | null>(null);
  const [hasSwitching, setHasSwitching] = useState<boolean | null>(null);
  const [customerCount, setCustomerCount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<OutageJob | null>(null);
  const [gisIssueCount, setGisIssueCount] = useState(0);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [documentMode, setDocumentMode] =
    useState<DocumentWorkflowModalMode | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [workflowHistoryRevision, setWorkflowHistoryRevision] = useState(0);
  const [closeSaving, setCloseSaving] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);

  useEffect(() => {
    const loadJob = async () => {
      if (!routeJobId) {
        setError("รหัสงานไม่ถูกต้อง");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await getJob(routeJobId);
      if (fetchError || !data) {
        setError(fetchError?.message ?? "ไม่พบงานที่ต้องการ");
        setLoading(false);
        return;
      }

      setJob(data);
      setOutageDate(data.outage_date);
      setEquipmentCode(data.equipment_code);
      setResponsibleUnit(
        isResponsibleUnit(data.responsible_unit) ? data.responsible_unit : ""
      );
      setWorkSupervisorPerson(getPersonReference(data.work_supervisor_person));
      setLegacyWorkSupervisorName(
        data.work_supervisor_person_id ? null : data.work_supervisor_name ?? null
      );
      setHasSwitching(data.has_switching ?? null);
      setCustomerCount(
        data.customer_count === null ? "" : String(data.customer_count)
      );
      setNote(data.note ?? "");
      try {
        const countsResponse = await fetch("/api/gis-issues/job-counts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_ids: [data.id] })
        });
        const countsResult = await countsResponse.json().catch(() => null);
        if (countsResponse.ok && countsResult?.ok) {
          setGisIssueCount(countsResult.data?.[data.id] ?? 0);
        }
      } catch (countsError) {
        console.warn("Unable to load GIS issue count", countsError);
      }
      setLoading(false);
    };

    loadJob();
  }, [routeJobId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!routeJobId) return;
    if (job?.is_closed) return;
    setError(null);

    if (!outageDate || !equipmentCode.trim()) {
      setError("กรุณากรอกวันที่และรหัสอุปกรณ์");
      return;
    }

    if (responsibleUnit && !workSupervisorPerson && !legacyWorkSupervisorName) {
      setError("กรุณาเลือกผู้ควบคุมงานจากรายชื่อบุคลากร");
      return;
    }

    const parsedCustomerCount = parseCustomerCount(customerCount);
    if (!parsedCustomerCount.success) {
      setError(parsedCustomerCount.error);
      return;
    }

    setSaving(true);
    const { error: updateError } = await updateJob(routeJobId, {
      outage_date: outageDate,
      equipment_code: equipmentCode.trim(),
      responsible_unit: responsibleUnit || null,
      work_supervisor_person_id: workSupervisorPerson?.id ?? null,
      has_switching: hasSwitching,
      customer_count: parsedCustomerCount.value,
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

  const handleWorkflowJobUpdate = (patch: Partial<OutageJob>) => {
    setJob((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleRollbackSuccess = (updatedJob: OutageJob) => {
    setJob(updatedJob);
    setWorkflowHistoryRevision((revision) => revision + 1);
    setToast({ message: "ย้อน Workflow เรียบร้อยแล้ว", tone: "success" });
    router.refresh();
  };

  const handleCloseJob = async (jobId: string) => {
    setCloseSaving(true);
    setCloseError(null);

    try {
      const result = await closeOutageJob(jobId);
      setToast({ message: "✅ ปิดงานเรียบร้อย", tone: "success" });
      setJob((prev) =>
        prev?.id === result.jobId
          ? {
              ...prev,
              is_closed: true,
              closed_at: result.closed_at ?? new Date().toISOString()
            }
          : prev
      );
      setCloseOpen(false);
      router.refresh();
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
      <AppShell><div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
        กำลังโหลดข้อมูล...
      </div></AppShell>
    );
  }

  const isClosed = job?.is_closed ?? false;
  const canCloseJob =
    (job?.social_status === "POSTED" || Boolean(job?.social_posted_at)) && !isClosed;
  const documentWorkflowAction = job ? getDocumentWorkflowAction(job) : null;
  const distributionWorkflow = job ? getDistributionWorkflow(job) : null;
  const workflowNextActionLabel =
    job &&
    distributionWorkflow &&
    !distributionWorkflow.completed &&
    (documentWorkflowAction === "SCHEDULE_NOTICE" ||
      documentWorkflowAction === "COMPLETE_NOTICE")
      ? distributionWorkflow.actionLabel
      : documentWorkflowAction
        ? getDocumentWorkflowActionLabel(documentWorkflowAction)
        : "-";
  const customerCountPreview = parseCustomerCount(customerCount);
  const customerCountDisplay =
    customerCountPreview.success && customerCountPreview.value !== null
      ? `${formatCustomerCount(customerCountPreview.value)} ราย`
      : "—";

  return (
    <AppShell>
    <div className="space-y-6">
      <header className="space-y-3 py-1">
        <p className="page-eyebrow">
          Job detail
        </p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="page-title">
              {isClosed ? "รายละเอียดงาน" : "แก้ไขงาน"}
            </h1>
            <p className="text-sm text-slate-600">
              {isClosed
                ? "งานนี้ถูกปิดแล้วและไม่สามารถแก้ไขได้"
                : "ปรับปรุงรายละเอียดหรือลบงานนี้ออกจากระบบ"}
            </p>
            {isClosed ? (
              <div className="text-sm text-slate-600">
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
            {gisIssueCount > 0 ? (
              <Link
                href={`/gis-issues?source_job_id=${job?.id}`}
                className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                ⚠ GIS Issues {gisIssueCount}
              </Link>
            ) : null}
            <Link
              href={`/gis-issues/new?source_job_id=${job?.id}`}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              ⚠ พบปัญหาข้อมูล GIS
            </Link>
            {job && (job.document_delivered_at || isNoticeScheduled(job)) && !isClosed ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setNoticeOpen(true)}
              >
                {distributionWorkflow?.actionLabel ?? "การแจกหนังสือดับไฟ"}
              </Button>
            ) : null}
            {canCloseJob ? (
              <Button
                type="button"
                size="sm"
                variant="closeWork"
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

      {job ? (
        <Card>
          <CardHeader>
            <CardTitle>ขั้นตอนดำเนินการ</CardTitle>
            <CardDescription>
              สร้างเอกสาร → รับเอกสาร → ส่งเอกสาร → แจกหนังสือ → Social → ปิดงาน
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentWorkflowPanel
              job={job}
              onReceive={() => setDocumentMode("receive")}
              onDeliver={() => setDocumentMode("deliver")}
              onNotice={() => setNoticeOpen(true)}
              onSocial={() => setSocialOpen(true)}
              onRollback={() => setRollbackOpen(true)}
            />
            <WorkflowAuditHistory
              jobId={job.id}
              refreshKey={workflowHistoryRevision}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>รายละเอียดงาน</CardTitle>
            <CardDescription>ข้อมูลพื้นฐานและหมายเหตุเพิ่มเติม</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="flex flex-col gap-6">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                วันที่ดับไฟ
                <Input
                  type="date"
                  value={outageDate}
                  onChange={(event) => setOutageDate(event.target.value)}
                  disabled={isClosed}
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                รหัสอุปกรณ์
                <Input
                  type="text"
                  value={equipmentCode}
                  onChange={(event) => setEquipmentCode(event.target.value)}
                  disabled={isClosed}
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                หน่วยงานผู้รับผิดชอบ
                <select
                  value={responsibleUnit}
                  onChange={(event) => {
                    const nextUnit = event.target.value as ResponsibleUnit | "";
                    if (nextUnit !== responsibleUnit) {
                      if (
                        workSupervisorPerson &&
                        (!nextUnit ||
                          !workSupervisorPerson.is_active ||
                          !isWorkSupervisorDepartmentEligible(
                            nextUnit,
                            workSupervisorPerson.department
                          ))
                      ) {
                        setWorkSupervisorPerson(null);
                      }
                      setLegacyWorkSupervisorName(null);
                    }
                    setResponsibleUnit(nextUnit);
                  }}
                  disabled={isClosed}
                  className={inputLight}
                >
                  <option value="">ไม่ระบุหน่วยงาน</option>
                  {RESPONSIBLE_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                ผู้ควบคุมงาน
                <PersonSelect
                  department={responsibleUnit}
                  value={workSupervisorPerson?.id ?? null}
                  selectedPerson={workSupervisorPerson}
                  legacyName={legacyWorkSupervisorName}
                  onChange={(person) => {
                    setWorkSupervisorPerson(person);
                    if (person) setLegacyWorkSupervisorName(null);
                  }}
                  required={Boolean(responsibleUnit)}
                  disabled={isClosed}
                  includeAllDepartments={
                    responsibleUnit === AONANG_RESPONSIBLE_UNIT
                  }
                  showDepartment={responsibleUnit === AONANG_RESPONSIBLE_UNIT}
                />
              </label>
              <SwitchingField
                value={hasSwitching}
                onChange={setHasSwitching}
                name="edit-job-switching"
                disabled={isClosed}
                showValueLabel
              />
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>จำนวนผู้ใช้ไฟฟ้า</span>
                  <span className="font-normal text-slate-500">
                    {customerCountDisplay}
                  </span>
                </span>
                <div className="relative">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_CUSTOMER_COUNT}
                    step={1}
                    value={customerCount}
                    onChange={(event) => setCustomerCount(event.target.value)}
                    placeholder="350"
                    disabled={isClosed}
                    className="pr-12"
                    aria-describedby="edit-job-customer-count-helper"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-normal text-slate-500">
                    ราย
                  </span>
                </div>
                <span
                  id="edit-job-customer-count-helper"
                  className="text-xs font-normal text-slate-500"
                >
                  ไม่บังคับ ล้างค่าเพื่อบันทึกเป็นไม่ระบุ
                </span>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
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
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-slate-900"
                >
                  กลับ
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
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
          <Card>
            <CardHeader>
              <CardTitle>การดำเนินการ</CardTitle>
              <CardDescription>งานที่เกี่ยวข้องกับสถานะนี้</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link
                href={`/gis-issues/new?source_job_id=${job?.id}`}
                className="inline-flex w-full items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
              >
                ⚠ พบปัญหาข้อมูล GIS
              </Link>
              {gisIssueCount > 0 ? (
                <Link
                  href={`/gis-issues?source_job_id=${job?.id}`}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                >
                  ดู GIS Issues ที่เชื่อมอยู่ ({gisIssueCount})
                </Link>
              ) : null}
              {job && (job.document_delivered_at || isNoticeScheduled(job)) && !isClosed ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => setNoticeOpen(true)}
                >
                  {distributionWorkflow?.actionLabel ?? "การแจกหนังสือดับไฟ"}
                </Button>
              ) : (
                <Badge variant="default">ขั้นตอนถัดไป: {workflowNextActionLabel}</Badge>
              )}
              {canCloseJob ? (
                <Button
                  type="button"
                  className="w-full"
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
        </div>
      </div>

      {noticeOpen && job ? (
        <NoticeScheduleModal
          job={job}
          open
          onOpenChange={setNoticeOpen}
          onJobUpdate={(_, patch) => handleNoticeJobUpdate(patch)}
        />
      ) : null}

      {documentMode && job ? (
        <DocumentWorkflowModal
          job={job}
          mode={documentMode}
          open
          onClose={() => setDocumentMode(null)}
          onJobUpdate={handleWorkflowJobUpdate}
        />
      ) : null}

      {socialOpen && job ? (
        <SocialPostPreviewModal
          job={job}
          isOpen
          onClose={() => setSocialOpen(false)}
          onJobUpdate={(_, patch) => handleWorkflowJobUpdate(patch)}
        />
      ) : null}

      {rollbackOpen && job ? (
        <WorkflowRollbackModal
          job={job}
          open
          onClose={() => setRollbackOpen(false)}
          onSuccess={handleRollbackSuccess}
        />
      ) : null}

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
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCloseOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (routeJobId) void handleCloseJob(routeJobId);
              }}
              disabled={closeSaving || !routeJobId}
            >
              {closeSaving ? "กำลังปิดงาน..." : "ยืนยันปิดงาน"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
    </AppShell>
  );
}
