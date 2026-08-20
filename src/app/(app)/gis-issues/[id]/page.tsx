"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import GisIssueForm, { issueToFormValue, type GisIssueFormValue } from "@/components/gis/GisIssueForm";
import GisIssueStatusBadge from "@/components/gis/GisIssueStatusBadge";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  formatThaiDateTime,
  formatThaiShortDate,
  getGisIssueTypeLabel,
  type GisIssue,
  type GisIssueActivity,
  type GisIssueStatus
} from "@/lib/gisIssues";
import { inputLight } from "@/lib/theme";

const detailRows = (issue: GisIssue) => [
  ["Feeder", issue.feeder_code],
  ["Equipment", issue.equipment_code || "-"],
  ["ประเภทปัญหา", getGisIssueTypeLabel(issue.issue_type, issue.issue_type_detail)],
  ["จุดที่พบ", issue.location_text || "-"],
  ["วันที่พบ", formatThaiShortDate(issue.found_at)],
  ["ผู้แจ้ง", issue.reporter_name],
  ["ผู้รับผิดชอบ", issue.assignee_name || "ยังไม่ระบุ"]
] as const;

export default function GisIssueDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [issue, setIssue] = useState<GisIssue | null>(null);
  const [activities, setActivities] = useState<GisIssueActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");

  const loadIssue = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/gis-issues/${params.id}`);
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? "ไม่พบ GIS Issue");
      setIssue(result.data);
      setActivities(result.activities ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "ไม่สามารถโหลด GIS Issue ได้");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void loadIssue();
  }, [loadIssue]);

  const patchIssue = async (payload: Record<string, unknown>) => {
    if (!issue) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/gis-issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? "ไม่สามารถอัปเดต GIS Issue ได้");
      await loadIssue();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "ไม่สามารถอัปเดต GIS Issue ได้");
      throw patchError;
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: GisIssueStatus, extra?: Record<string, unknown>) => {
    try {
      await patchIssue({ status, ...extra });
      setResolutionOpen(false);
      setResolutionNote("");
    } catch {
      // Error is displayed above the detail card.
    }
  };

  const updateIssue = async (value: GisIssueFormValue) => {
    await patchIssue(value);
    setEditOpen(false);
  };

  const submitResolution = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resolutionNote.trim()) {
      setError("กรุณาระบุรายละเอียดการแก้ไข");
      return;
    }
    void changeStatus("VERIFYING", { resolution_note: resolutionNote.trim() });
  };

  const closeDeleteDialog = () => {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteError(null);
  };

  const deleteIssue = async () => {
    if (!issue || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/gis-issues/${issue.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "ไม่สามารถลบ GIS Issue ได้");
      }

      setDeleteOpen(false);
      router.replace("/gis-issues");
      router.refresh();
    } catch (deleteFailure) {
      setDeleteError(
        deleteFailure instanceof Error ? deleteFailure.message : "ไม่สามารถลบ GIS Issue ได้"
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <p className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">กำลังโหลดข้อมูล...</p>;
  if (!issue) return <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error || "ไม่พบ GIS Issue"}</p>;

  return (
    <div className="space-y-4">
      <header className="page-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/gis-issues" className="text-xs font-semibold text-slate-500 hover:text-slate-800">← GIS Issues</Link>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{issue.issue_number}</h1>
              <GisIssueStatusBadge status={issue.status} />
            </div>
            <p className="mt-1 text-sm text-slate-600">{issue.feeder_code}{issue.equipment_code ? ` / ${issue.equipment_code}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>แก้ไขรายละเอียด</Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              ลบ Issue
            </Button>
            {issue.status === "OPEN" ? <Button size="sm" onClick={() => void changeStatus("IN_PROGRESS")} disabled={saving}>เริ่มดำเนินการ</Button> : null}
            {issue.status === "IN_PROGRESS" ? <Button size="sm" onClick={() => { setResolutionNote(issue.resolution_note ?? ""); setResolutionOpen(true); }}>ส่งตรวจสอบ</Button> : null}
            {issue.status === "VERIFYING" ? <Button size="sm" variant="closeWork" onClick={() => void changeStatus("CLOSED")} disabled={saving}>ปิด Issue</Button> : null}
            {issue.status === "VERIFYING" || issue.status === "CLOSED" ? <Button size="sm" variant="secondary" onClick={() => void changeStatus("OPEN")} disabled={saving}>เปิดกลับมาใหม่</Button> : null}
          </div>
        </div>
      </header>

      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-xl">รายละเอียด Issue</CardTitle></CardHeader>
            <CardContent className="space-y-4 pt-4">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {detailRows(issue).map(([label, value]) => (
                  <div key={label} className="border-b border-slate-100 pb-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                    <dd className="mt-1 text-sm text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <h2 className="text-xs font-semibold text-slate-500">สิ่งที่ผิด</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{issue.description}</p>
              </div>
              <div>
                <h2 className="text-xs font-semibold text-slate-500">สิ่งที่ควรเป็น</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{issue.expected_value || "-"}</p>
              </div>
              <div>
                <h2 className="text-xs font-semibold text-slate-500">Resolution note</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{issue.resolution_note || "ยังไม่มีข้อมูลการแก้ไข"}</p>
              </div>
              {issue.reference_url ? (
                <a href={issue.reference_url} target="_blank" rel="noreferrer" className="inline-flex text-sm font-semibold text-orange-700 underline underline-offset-2">เปิด URL อ้างอิง ↗</a>
              ) : null}
            </CardContent>
          </Card>

          {issue.source_job ? (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">JOB ต้นทาง</p>
                  <p className="mt-1 text-sm text-slate-900">สร้างจากงาน {issue.source_job.equipment_code} / {formatThaiShortDate(issue.source_job.outage_date)}</p>
                </div>
                <Link href={`/job/${issue.source_job.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">ดูงานต้นทาง</Link>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">วันที่ดำเนินการ</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-3 text-sm">
              <p className="flex justify-between gap-3 text-slate-600"><span>เริ่มแก้</span><span className="text-right text-slate-900">{formatThaiDateTime(issue.started_at)}</span></p>
              <p className="flex justify-between gap-3 text-slate-600"><span>แก้แล้ว</span><span className="text-right text-slate-900">{formatThaiDateTime(issue.resolved_at)}</span></p>
              <p className="flex justify-between gap-3 text-slate-600"><span>ตรวจสอบ/ปิด</span><span className="text-right text-slate-900">{formatThaiDateTime(issue.verified_at)}</span></p>
              <p className="flex justify-between gap-3 text-slate-600"><span>อัปเดตล่าสุด</span><span className="text-right text-slate-900">{formatThaiDateTime(issue.updated_at)}</span></p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Timeline / Activity</CardTitle></CardHeader>
            <CardContent className="pt-3">
              {activities.length === 0 ? <p className="text-sm text-slate-500">ยังไม่มีกิจกรรม</p> : (
                <ol className="space-y-3">
                  {activities.map((activity) => (
                    <li key={activity.id} className="relative border-l border-slate-200 pl-4 text-sm">
                      <span className="absolute -left-1 top-1.5 h-2 w-2 rounded-full bg-orange-400" />
                      <p className="text-slate-900">{activity.message}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatThaiDateTime(activity.created_at)} — {activity.actor_name}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal isOpen={editOpen} title={`แก้ไข ${issue.issue_number}`} onClose={() => setEditOpen(false)}>
        <GisIssueForm initialValue={issueToFormValue(issue)} submitLabel="บันทึกการแก้ไข" onSubmit={updateIssue} onCancel={() => setEditOpen(false)} />
      </Modal>

      <Modal
        isOpen={deleteOpen}
        title={`ลบ ${issue.issue_number} ?`}
        onClose={closeDeleteDialog}
        panelClassName="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeDeleteDialog} disabled={deleting}>
              ยกเลิก
            </Button>
            <Button type="button" variant="danger" onClick={() => void deleteIssue()} disabled={deleting}>
              {deleting ? "กำลังลบ..." : "ลบ Issue"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm leading-6 text-slate-700">
            การดำเนินการนี้จะลบ Issue และประวัติ Activity ที่เกี่ยวข้องทั้งหมด และไม่สามารถย้อนกลับได้
          </p>
          {deleteError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {deleteError}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={resolutionOpen}
        title="ส่ง Issue เพื่อตรวจสอบ"
        onClose={() => setResolutionOpen(false)}
        onSubmit={submitResolution}
        footer={<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setResolutionOpen(false)}>ยกเลิก</Button><Button type="submit" disabled={saving}>{saving ? "กำลังบันทึก..." : "ส่งตรวจสอบ"}</Button></div>}
      >
        <label className="space-y-2 text-sm font-semibold text-slate-700">
          รายละเอียดการแก้ไข <span className="text-rose-600">*</span>
          <textarea className={`${inputLight} min-h-[120px]`} value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="ระบุสิ่งที่ได้แก้ไขใน GIS" required />
        </label>
      </Modal>
    </div>
  );
}
