"use client";

import { FormEvent, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { formatPlannedNotifyThaiDateTime, formatThaiDateBE } from "@/lib/reminder";
import { cn } from "@/lib/utils";
import { labelText, subtitleText, titleText } from "@/lib/theme";

type ReminderSettings = {
  timezone: string;
  lead_reminder_enabled: boolean;
  lead_reminder_days: number;
  lead_reminder_time: string;
  same_day_reminder_enabled: boolean;
  same_day_reminder_time: string;
};

type ApiResult<T> = {
  response: Response;
  data: T | null;
  text: string;
};

type ReminderSettingsApiResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  settings?: ReminderSettings;
};

type ReminderReadinessStatus = "disabled" | "scheduled" | "ready_today" | "sent" | "skipped";

type ReminderPreviewItem = {
  id: number | string;
  equipment_code: string | null;
  outage_date: string | null;
  notificationType: "lead" | "same_day";
  plannedNotifyDate: string | null;
  plannedNotifyTime: string;
  plannedNotifyAt: string | null;
  readinessStatus: ReminderReadinessStatus;
  readinessReason: string;
  wouldSend: boolean;
  skipReason: string | null;
  messagePreview: string;
};

type ReminderPreviewSection = {
  enabled: boolean;
  targetDate: string;
  scheduleTime: string;
  nextRunAt: string | null;
  summaryText: string;
  matched: number;
  eligible: number;
  skipped: number;
  items: ReminderPreviewItem[];
};

type ReminderPreviewResponse = {
  ok: true;
  generatedAt: string;
  timezone: string;
  settingsDebug: {
    lead_reminder_time_from_db: string;
    same_day_reminder_time_from_db: string;
    source: "database";
  };
  settings: {
    lead_reminder_enabled: boolean;
    lead_reminder_days: number;
    same_day_reminder_enabled: boolean;
  };
  systemStatus: {
    isSystemReady: boolean;
    hasLineToken: boolean;
    hasLineTargetId: boolean;
    hasSupabaseUrl: boolean;
    hasSupabaseServiceRoleKey: boolean;
    leadReminderScheduleTime: string;
    sameDayReminderScheduleTime: string;
    nextLeadRunAt: string | null;
    nextSameDayRunAt: string | null;
  };
  leadPreview: ReminderPreviewSection;
  sameDayPreview: ReminderPreviewSection;
};

type ManualRunResponse = {
  ok: boolean;
  error?: string;
  targetDateUsed: string;
  totalRowsChecked: number;
  matched: number;
  sent: number;
  skipped: number;
  matchedRows: Array<{
    id: number | string;
    equipment_code: string | null;
    outage_date: string | null;
  }>;
};

const defaultSettings: ReminderSettings = {
  timezone: "Asia/Bangkok",
  lead_reminder_enabled: true,
  lead_reminder_days: 5,
  lead_reminder_time: "08:00",
  same_day_reminder_enabled: true,
  same_day_reminder_time: "08:00",
};

async function parseApiResult<T>(response: Response): Promise<ApiResult<T>> {
  const contentType = response.headers.get("content-type") ?? "";
  const rawText = await response.text();

  if (!rawText) {
    return { response, data: null, text: "" };
  }

  if (contentType.includes("application/json")) {
    try {
      return { response, data: JSON.parse(rawText) as T, text: rawText };
    } catch {
      return { response, data: null, text: rawText };
    }
  }

  try {
    return { response, data: JSON.parse(rawText) as T, text: rawText };
  } catch {
    return { response, data: null, text: rawText };
  }
}

function formatBangkokDateTime(dateText: string | null): string {
  if (!dateText) return "-";
  return new Date(dateText).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

function readinessBadgeClass(status: ReminderReadinessStatus): string {
  if (status === "ready_today") return "bg-emerald-100 text-emerald-700";
  if (status === "sent") return "bg-sky-100 text-sky-700";
  if (status === "scheduled") return "bg-amber-100 text-amber-700";
  if (status === "disabled") return "bg-slate-200 text-slate-700";
  return "bg-rose-100 text-rose-700";
}

function SystemStatusCard({ preview }: { preview: ReminderPreviewResponse }) {
  const status = preview.systemStatus;

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">สถานะระบบแจ้งเตือน</p>
      <p className="text-xs text-slate-600">
        สถานะรวม: {status.isSystemReady ? "พร้อมส่ง" : "ยังไม่พร้อมส่ง"} · เวลาอ้างอิง: {preview.timezone}
      </p>
      <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <p>Lead reminder: {status.leadReminderScheduleTime} · รอบถัดไป {formatBangkokDateTime(status.nextLeadRunAt)}</p>
        <p>Same-day reminder: {status.sameDayReminderScheduleTime} · รอบถัดไป {formatBangkokDateTime(status.nextSameDayRunAt)}</p>
      </div>
      <p className="text-xs text-slate-500">
        DB debug → lead: {preview.settingsDebug.lead_reminder_time_from_db} · same-day:{" "}
        {preview.settingsDebug.same_day_reminder_time_from_db} ({preview.settingsDebug.source})
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className={cn("rounded-full px-2 py-0.5", status.hasLineToken ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>LINE token</span>
        <span className={cn("rounded-full px-2 py-0.5", status.hasLineTargetId ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>LINE target</span>
        <span className={cn("rounded-full px-2 py-0.5", status.hasSupabaseUrl ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>Supabase URL</span>
        <span className={cn("rounded-full px-2 py-0.5", status.hasSupabaseServiceRoleKey ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>Service role key</span>
      </div>
    </div>
  );
}

function PreviewSectionCard({
  title,
  emptyMessage,
  section,
}: {
  title: string;
  emptyMessage: string;
  section: ReminderPreviewSection;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">
          สถานะ: {section.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"} · target date: {section.targetDate} · เวลาแจ้งเตือน: {section.scheduleTime}
        </p>
        <p className="text-xs text-slate-500">รอบถัดไป: {formatBangkokDateTime(section.nextRunAt)}</p>
        <p className="text-xs text-slate-500">{section.summaryText}</p>
        <p className="text-xs text-slate-500">
          matched {section.matched} · eligible {section.eligible} · skipped {section.skipped}
        </p>
      </div>

      {section.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3">
          {section.items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-900">งาน: {item.equipment_code ?? "-"}</span>
                <span className="text-slate-500">วันที่ดับไฟ: {formatThaiDateBE(item.outage_date)}</span>
                <span className={cn("rounded-full px-2 py-0.5 font-medium", readinessBadgeClass(item.readinessStatus))}>
                  {item.readinessStatus}
                </span>
                {!item.wouldSend && item.skipReason ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-700">{item.skipReason}</span>
                ) : null}
              </div>

              <div className="mb-2 space-y-1 rounded-lg bg-white p-2 text-xs text-slate-700">
                <p>จะถูกแจ้งเตือนวันที่: {formatThaiDateBE(item.plannedNotifyDate)}</p>
                <p>เวลา: {item.plannedNotifyTime}</p>
                <p>planned at: {formatBangkokDateTime(item.plannedNotifyAt)}</p>
                <p>สถานะตอนนี้: {item.readinessReason}</p>
                {item.readinessStatus === "scheduled" ? (
                  <p className="text-amber-700">
                    ยังไม่ถึงวันแจ้งเตือน ระบบจะส่งในวันที่ {formatPlannedNotifyThaiDateTime(item.plannedNotifyDate, item.plannedNotifyTime)}
                  </p>
                ) : null}
              </div>

              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-xs text-slate-700">
                {item.messagePreview}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReminderSettingsPage() {
  const [settings, setSettings] = useState<ReminderSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReminderPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isManualRunLoading, setIsManualRunLoading] = useState(false);
  const [manualRunError, setManualRunError] = useState<string | null>(null);
  const [manualRunSuccess, setManualRunSuccess] = useState<string | null>(null);
  const [manualRunResult, setManualRunResult] = useState<ManualRunResponse | null>(null);
  const [manualRunAt, setManualRunAt] = useState<string | null>(null);

  const loadPreview = async () => {
    setPreviewError(null);
    setIsPreviewLoading(true);

    try {
      const response = await fetch("/api/settings/reminders/preview", { cache: "no-store" });
      const { data, text } = await parseApiResult<ReminderPreviewResponse & { error?: string }>(
        response
      );
      const body = data;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? text ?? "โหลด preview ไม่สำเร็จ");
      }

      setPreview(body as ReminderPreviewResponse);
    } catch (loadError: unknown) {
      const message = loadError instanceof Error ? loadError.message : "โหลด preview ไม่สำเร็จ";
      setPreviewError(message);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);

    fetch("/api/settings/reminders", { cache: "no-store" })
      .then(async (response) => {
        const { data, text } = await parseApiResult<ReminderSettingsApiResponse>(response);
        const body = data;
        if (!response.ok || !body?.ok) {
          throw new Error(body?.error ?? text ?? "โหลดการตั้งค่าไม่สำเร็จ");
        }

        if (!isActive) return;
        setSettings(body.settings ?? defaultSettings);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!isActive) return;
        const message =
          loadError instanceof Error ? loadError.message : "โหลดการตั้งค่าไม่สำเร็จ";
        setError(message);
      })
      .finally(() => {
        if (!isActive) return;
        setIsLoading(false);
      });

    loadPreview();

    return () => {
      isActive = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/reminders", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      const { data, text } = await parseApiResult<ReminderSettingsApiResponse>(response);
      const body = data;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? text ?? "บันทึกการตั้งค่าไม่สำเร็จ");
      }

      setSettings(body.settings ?? settings);
      setSuccess(body.message ?? "บันทึกการตั้งค่าเรียบร้อยแล้ว");
      await loadPreview();
    } catch (saveError: unknown) {
      const message =
        saveError instanceof Error ? saveError.message : "ไม่สามารถบันทึกการตั้งค่าได้ กรุณาลองใหม่อีกครั้ง";
      setError(message === "Unexpected end of JSON input" ? "ไม่สามารถอ่านผลลัพธ์จากระบบได้ กรุณาลองใหม่อีกครั้ง" : message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualRun = async () => {
    setManualRunError(null);
    setManualRunSuccess(null);
    setManualRunResult(null);
    setIsManualRunLoading(true);

    try {
      const response = await fetch("/api/jobs/reminder/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dryRun: false }),
      });
      const { data, text } = await parseApiResult<ManualRunResponse>(response);
      const body = data as ManualRunResponse | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? text ?? "รันแจ้งเตือนไม่สำเร็จ");
      }

      setManualRunAt(new Date().toISOString());
      setManualRunResult(body);
      setManualRunSuccess("รันแจ้งเตือนสำเร็จ");
      await loadPreview();
    } catch (runError: unknown) {
      const message = runError instanceof Error ? runError.message : "รันแจ้งเตือนไม่สำเร็จ";
      setManualRunError(message);
    } finally {
      setIsManualRunLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2 pb-1">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Settings
        </p>
        <h1 className={cn(titleText, "text-3xl")}>Reminder Settings</h1>
        <p className={subtitleText}>ตั้งค่าเปิด/ปิดการแจ้งเตือนและจำนวนวันล่วงหน้า</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>ตั้งค่าการแจ้งเตือน LINE (รายวัน)</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 sm:grid-cols-2">
              <label className={cn("flex items-center gap-3", labelText)}>
                <input
                  type="checkbox"
                  checked={settings.lead_reminder_enabled}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      lead_reminder_enabled: event.target.checked,
                    }))
                  }
                />
                เปิดแจ้งเตือนล่วงหน้า
              </label>

              <label className={cn("flex flex-col gap-2", labelText)}>
                จำนวนวันล่วงหน้า
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={settings.lead_reminder_days}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      lead_reminder_days: Number(event.target.value || 0),
                    }))
                  }
                  disabled={isLoading}
                />
              </label>
              <label className={cn("flex flex-col gap-2", labelText)}>
                เวลาแจ้งเตือนล่วงหน้า
                <Input
                  type="time"
                  value={settings.lead_reminder_time}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      lead_reminder_time: event.target.value,
                    }))
                  }
                  disabled={isLoading || isSaving}
                />
              </label>
            </div>

            <div className="grid gap-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 sm:grid-cols-2">
              <label className={cn("flex items-center gap-3", labelText)}>
                <input
                  type="checkbox"
                  checked={settings.same_day_reminder_enabled}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      same_day_reminder_enabled: event.target.checked,
                    }))
                  }
                />
                เปิดแจ้งเตือนวันจริง
              </label>
              <label className={cn("flex flex-col gap-2", labelText)}>
                เวลาแจ้งเตือนวันจริง
                <Input
                  type="time"
                  value={settings.same_day_reminder_time}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      same_day_reminder_time: event.target.value,
                    }))
                  }
                  disabled={isLoading || isSaving}
                />
              </label>
            </div>

            <p className="text-xs text-slate-500">
              ระบบส่งด้วย Vercel Cron วันละครั้ง (เวลา deploy คงที่) และอิง Asia/Bangkok
            </p>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isLoading || isSaving} className="w-auto px-5">
                {isLoading ? "กำลังโหลด..." : isSaving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isPreviewLoading || isManualRunLoading}
                onClick={loadPreview}
                className="w-auto px-5"
              >
                {isPreviewLoading ? "กำลังตรวจสอบ..." : "ตรวจสอบรายการแจ้งเตือน"}
              </Button>
            </div>

            <div className="space-y-3">
              <Button
                type="button"
                variant="secondary"
                disabled={isManualRunLoading || isPreviewLoading}
                onClick={handleManualRun}
                className="w-auto px-5"
              >
                {isManualRunLoading ? "กำลังรัน..." : "รันแจ้งเตือนตอนนี้"}
              </Button>
              <p className="text-xs text-slate-500">
                ใช้สำหรับทดสอบการทำงานแบบเดียวกับ cron โดยไม่ต้องรอรอบอัตโนมัติ
              </p>
            </div>

            {manualRunError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {manualRunError}
              </div>
            ) : null}
            {manualRunSuccess ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {manualRunSuccess}
              </div>
            ) : null}
            {manualRunResult ? (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">ผลการรันแจ้งเตือนทันที</p>
                <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                  <p>จำนวนงานที่ตรวจพบ: {manualRunResult.totalRowsChecked}</p>
                  <p>จำนวนงานที่เข้าเงื่อนไขแจ้งเตือน: {manualRunResult.matched}</p>
                  <p>targetDateUsed: {manualRunResult.targetDateUsed || "-"}</p>
                  <p>เวลาที่รัน: {formatBangkokDateTime(manualRunAt)}</p>
                  <p>จำนวนที่ส่งแล้ว: {manualRunResult.sent}</p>
                  <p>จำนวนที่ข้าม: {manualRunResult.skipped}</p>
                </div>

                {manualRunResult.matchedRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
                    ไม่พบรายการที่ต้องแจ้งเตือนในรอบนี้
                  </div>
                ) : (
                  <div className="space-y-2">
                    {manualRunResult.matchedRows.map((job) => (
                      <div key={job.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                        <p>job id: {job.id}</p>
                        <p>เลขงาน: {job.equipment_code ?? "-"}</p>
                        <p>วันที่แจ้งเตือน: {manualRunResult.targetDateUsed || "-"}</p>
                        <p>ประเภท reminder: แจ้งเตือนล่วงหน้า</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview Reminder</CardTitle>
          <p className="text-sm text-slate-500">ตัวอย่างงานที่ระบบจะส่งแจ้งเตือนจากข้อมูลปัจจุบัน</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {previewError}
            </div>
          ) : null}

          {preview ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                generatedAt: {formatBangkokDateTime(preview.generatedAt)} · timezone: {preview.timezone}
              </div>
              <SystemStatusCard preview={preview} />
              <PreviewSectionCard
                title="แจ้งเตือนล่วงหน้า"
                emptyMessage="วันนี้ไม่มีงานที่เข้าเงื่อนไขแจ้งเตือนล่วงหน้า"
                section={preview.leadPreview}
              />
              <PreviewSectionCard
                title="แจ้งเตือนวันจริง"
                emptyMessage="วันนี้ไม่มีงานแจ้งเตือนวันจริง"
                section={preview.sameDayPreview}
              />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              {isPreviewLoading ? "กำลังคำนวณ preview จากฐานข้อมูล..." : "ยังไม่มีข้อมูล preview"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
