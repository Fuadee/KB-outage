"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { formatThaiDateBE } from "@/lib/reminder";
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
    timezone: string;
    routeLeadReady: boolean;
    routeSameDayReady: boolean;
  };
  leadPreview: ReminderPreviewSection;
  sameDayPreview: ReminderPreviewSection;
};

type ManualRunResult = {
  route: "lead" | "same-day";
  ok: boolean;
  targetDateUsed: string;
  matched: number;
  sent: number;
  skipped: number;
  message: string;
  skipReasons: Record<string, number>;
  runAt: string;
};

const defaultSettings: ReminderSettings = {
  timezone: "Asia/Bangkok",
  lead_reminder_enabled: true,
  lead_reminder_days: 5,
  lead_reminder_time: "08:00",
  same_day_reminder_enabled: true,
  same_day_reminder_time: "08:00",
};

function isSameSettings(a: ReminderSettings, b: ReminderSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatBangkokDateTime(dateText: string | null): string {
  if (!dateText) return "-";
  return new Date(dateText).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

function statusChip(ok: boolean): string {
  return ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700";
}

function toSkipReasonList(map: Record<string, number>): string {
  const entries = Object.entries(map);
  if (entries.length === 0) return "-";
  return entries.map(([key, count]) => `${key} (${count})`).join(", ");
}

function normalizeManualRunResponse(
  route: "lead" | "same-day",
  payload: Record<string, unknown> | null
): ManualRunResult {
  const diagnostics =
    payload && typeof payload.diagnostics === "object"
      ? (payload.diagnostics as Record<string, unknown>)
      : null;
  const skipReasonsCandidate =
    (diagnostics?.skipReasons as Record<string, number> | undefined) ??
    (payload?.skipReasons as Record<string, number> | undefined) ??
    {};
  const ok = Boolean(payload?.ok);
  const message =
    ok ? "รันสำเร็จ" : typeof payload?.error === "string" ? payload.error : "รันไม่สำเร็จ";

  return {
    route,
    ok,
    targetDateUsed: String(payload?.targetDateUsed ?? "-"),
    matched: Number(payload?.matched ?? 0),
    sent: Number(payload?.sent ?? 0),
    skipped: Number(payload?.skipped ?? 0),
    message,
    skipReasons: skipReasonsCandidate,
    runAt: new Date().toISOString(),
  };
}

function SectionPreviewBlock({ title, section }: { title: string; section: ReminderPreviewSection }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="space-y-1 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">{title}</p>
        <p>targetDate: {section.targetDate}</p>
        <p>
          matched {section.matched} · eligible {section.eligible} · skipped {section.skipped}
        </p>
      </div>
      {section.items.length === 0 ? (
        <p className="text-sm text-slate-500">ไม่พบรายการในรอบนี้</p>
      ) : (
        <div className="space-y-2">
          {section.items.slice(0, 5).map((item) => (
            <div key={`${title}-${item.id}`} className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">งาน: {item.equipment_code ?? "-"}</p>
              <p>วันที่ดับไฟ: {formatThaiDateBE(item.outage_date)}</p>
              <p>สถานะ: {item.readinessReason}</p>
              <p>ข้อความตัวอย่าง: {item.messagePreview}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReminderSettingsPage() {
  const [formSettings, setFormSettings] = useState<ReminderSettings>(defaultSettings);
  const [actualSettings, setActualSettings] = useState<ReminderSettings>(defaultSettings);
  const [previewData, setPreviewData] = useState<ReminderPreviewResponse | null>(null);
  const [manualLeadRunResult, setManualLeadRunResult] = useState<ManualRunResult | null>(null);
  const [manualSameDayRunResult, setManualSameDayRunResult] = useState<ManualRunResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isManualLeadLoading, setIsManualLeadLoading] = useState(false);
  const [isManualSameDayLoading, setIsManualSameDayLoading] = useState(false);

  const isDirty = useMemo(() => !isSameSettings(formSettings, actualSettings), [formSettings, actualSettings]);

  const loadActualSettings = async (): Promise<ReminderSettings | null> => {
    const response = await fetch("/api/settings/reminders", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as ReminderSettingsApiResponse | null;
    if (!response.ok || !body?.ok || !body.settings) {
      throw new Error(body?.error ?? "โหลดค่าที่ใช้งานจริงจากระบบไม่สำเร็จ");
    }
    setActualSettings(body.settings);
    setFormSettings(body.settings);
    return body.settings;
  };

  const loadPreview = async () => {
    setPreviewError(null);
    setIsPreviewLoading(true);
    try {
      const response = await fetch("/api/settings/reminders/preview", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as (ReminderPreviewResponse & { error?: string }) | null;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "โหลดตัวอย่างการแจ้งเตือนไม่สำเร็จ");
      }
      setPreviewData(body);
    } catch (previewLoadError) {
      setPreviewError(previewLoadError instanceof Error ? previewLoadError.message : "โหลดตัวอย่างไม่สำเร็จ");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const refreshDbDrivenData = async () => {
    await Promise.all([loadActualSettings(), loadPreview()]);
  };

  useEffect(() => {
    setIsInitialLoading(true);
    refreshDbDrivenData()
      .then(() => {
        setError(null);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "โหลดข้อมูลตั้งต้นไม่สำเร็จ");
      })
      .finally(() => {
        setIsInitialLoading(false);
      });
  }, []);

  const onSave = async () => {
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      const settings = formSettings;
      console.log("reminder-settings-submit-payload", {
        lead_reminder_time: settings.lead_reminder_time,
        same_day_reminder_time: settings.same_day_reminder_time,
        payload: settings,
      });
      const response = await fetch("/api/settings/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = (await response.json().catch(() => null)) as ReminderSettingsApiResponse | null;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "บันทึกการตั้งค่าไม่สำเร็จ");
      }
      await refreshDbDrivenData();
      setSuccess("บันทึกค่าเวลาแจ้งเตือนสำเร็จ และรีเฟรชค่าจริงจากระบบแล้ว");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกการตั้งค่าไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const onReloadActual = async () => {
    if (isDirty) {
      const confirmed = window.confirm("คุณมี draft ที่ยังไม่บันทึก ต้องการทิ้งและโหลดค่าจริงจากระบบหรือไม่?");
      if (!confirmed) return;
    }

    setError(null);
    setIsReloading(true);
    try {
      await loadActualSettings();
      setSuccess("โหลดค่าที่ใช้งานจริงจากระบบเรียบร้อยแล้ว");
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : "โหลดค่าจริงไม่สำเร็จ");
    } finally {
      setIsReloading(false);
    }
  };

  const runManual = async (route: "lead" | "same-day") => {
    setManualError(null);
    setSuccess(null);

    const targetPath = route === "lead" ? "/api/jobs/reminder/run" : "/api/jobs/reminder/same-day/run";
    if (route === "lead") {
      setIsManualLeadLoading(true);
    } else {
      setIsManualSameDayLoading(true);
    }

    try {
      const response = await fetch(targetPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const body = await response.json().catch(() => null);
      const normalized = normalizeManualRunResponse(route, body);

      if (!response.ok || !normalized.ok) {
        throw new Error(normalized.message);
      }

      if (route === "lead") {
        setManualLeadRunResult(normalized);
      } else {
        setManualSameDayRunResult(normalized);
      }

      await refreshDbDrivenData();
      setSuccess(`ทดสอบรัน ${route === "lead" ? "Lead" : "Same-day"} สำเร็จ และรีเฟรชข้อมูลแล้ว`);
    } catch (manualRunError) {
      setManualError(manualRunError instanceof Error ? manualRunError.message : "รันไม่สำเร็จ");
    } finally {
      if (route === "lead") {
        setIsManualLeadLoading(false);
      } else {
        setIsManualSameDayLoading(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2 pb-1">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Settings</p>
        <h1 className={cn(titleText, "text-3xl")}>Reminder Settings</h1>
        <p className={subtitleText}>จัดการรอบแจ้งเตือนแบบแยกชัดเจน: draft, ค่าจริงจาก DB, preview, และการรันจริง</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>ตั้งค่าเวลาแจ้งเตือน</CardTitle>
          <p className="text-sm text-slate-500">ส่วนนี้ใช้กำหนดค่าที่ระบบจะนำไปใช้จริงเมื่อกดบันทึกแล้ว</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDirty ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Lead reminder</p>
              <label className={cn("flex items-center gap-3", labelText)}>
                <input
                  type="checkbox"
                  checked={formSettings.lead_reminder_enabled}
                  onChange={(event) =>
                    setFormSettings((current) => ({ ...current, lead_reminder_enabled: event.target.checked }))
                  }
                />
                เปิด/ปิด Lead reminder
              </label>
              <p className="text-xs text-slate-500">กำหนดว่าจะส่งแจ้งเตือนล่วงหน้าหรือไม่</p>

              <label className={cn("flex flex-col gap-2", labelText)}>
                จำนวนวันล่วงหน้า
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={formSettings.lead_reminder_days}
                  onChange={(event) =>
                    setFormSettings((current) => ({ ...current, lead_reminder_days: Number(event.target.value || 0) }))
                  }
                  disabled={isInitialLoading || isSaving}
                />
              </label>
              <p className="text-xs text-slate-500">ระบบจะมองหางานที่ outage_date ล่วงหน้า X วัน</p>

              <label className={cn("flex flex-col gap-2", labelText)}>
                เวลา Lead reminder
                <Input
                  type="time"
                  value={formSettings.lead_reminder_time}
                  onChange={(event) =>
                    setFormSettings((current) => ({ ...current, lead_reminder_time: event.target.value }))
                  }
                  disabled={isInitialLoading || isSaving}
                />
              </label>
              <p className="text-xs text-slate-500">เวลา cron/manual จะใช้อ้างอิงโซนเวลา Asia/Bangkok</p>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Same-day reminder</p>
              <label className={cn("flex items-center gap-3", labelText)}>
                <input
                  type="checkbox"
                  checked={formSettings.same_day_reminder_enabled}
                  onChange={(event) =>
                    setFormSettings((current) => ({ ...current, same_day_reminder_enabled: event.target.checked }))
                  }
                />
                เปิด/ปิด Same-day reminder
              </label>
              <p className="text-xs text-slate-500">กำหนดว่าจะส่งแจ้งเตือนวันจริงหรือไม่</p>

              <label className={cn("flex flex-col gap-2", labelText)}>
                เวลา Same-day reminder
                <Input
                  type="time"
                  value={formSettings.same_day_reminder_time}
                  onChange={(event) =>
                    setFormSettings((current) => ({ ...current, same_day_reminder_time: event.target.value }))
                  }
                  disabled={isInitialLoading || isSaving}
                />
              </label>
              <p className="text-xs text-slate-500">ใช้กับ flow แจ้งเตือนวันจริง (คนละ route กับ lead)</p>

              <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700">
                Timezone ที่ระบบใช้จริง: <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">Asia/Bangkok</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">บันทึกค่า / ดูตัวอย่าง</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={onSave} disabled={isInitialLoading || isSaving} className="w-auto px-5">
                {isSaving ? "กำลังบันทึก..." : "บันทึกค่าเวลาแจ้งเตือน"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onReloadActual}
                disabled={isInitialLoading || isReloading || isSaving}
                className="w-auto px-5"
              >
                {isReloading ? "กำลังโหลด..." : "โหลดค่าที่ใช้งานจริงจากระบบ"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={loadPreview}
                disabled={isPreviewLoading || isSaving}
                className="w-auto px-5"
              >
                {isPreviewLoading ? "กำลังคำนวณ..." : "ดูตัวอย่างการแจ้งเตือนจากค่าที่บันทึกแล้ว"}
              </Button>
            </div>
            <p className="text-xs text-slate-500">ตัวอย่างการแจ้งเตือนและการรันจริงจะอิงค่าที่บันทึกแล้วในฐานข้อมูลเท่านั้น</p>
            {isDirty ? (
              <p className="text-xs text-amber-700">หากกด “โหลดค่าที่ใช้งานจริงจากระบบ” จะทิ้ง draft ที่ยังไม่บันทึก</p>
            ) : null}
          </div>

          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {previewError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{previewError}</div>
          ) : null}
          {success ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ค่าที่ระบบใช้งานจริงตอนนี้</CardTitle>
          <p className="text-sm text-slate-500">ข้อมูลนี้มาจาก database และใช้ตอน cron/manual run จริง</p>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          <p>Lead reminder: {actualSettings.lead_reminder_enabled ? "เปิด" : "ปิด"}</p>
          <p>Lead days: {actualSettings.lead_reminder_days} วัน</p>
          <p>Lead time: {actualSettings.lead_reminder_time}</p>
          <p>Same-day reminder: {actualSettings.same_day_reminder_enabled ? "เปิด" : "ปิด"}</p>
          <p>Same-day time: {actualSettings.same_day_reminder_time}</p>
          <p>Timezone: {actualSettings.timezone}</p>
          <p>source: database</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ตัวอย่างการแจ้งเตือน</CardTitle>
          <p className="text-sm text-slate-500">คำนวณจากค่าที่บันทึกแล้วในระบบ (DB)</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewData ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                generatedAt: {formatBangkokDateTime(previewData.generatedAt)} · nextLeadRunAt: {formatBangkokDateTime(previewData.systemStatus.nextLeadRunAt)} · nextSameDayRunAt: {formatBangkokDateTime(previewData.systemStatus.nextSameDayRunAt)}
              </div>
              <SectionPreviewBlock title="Lead preview" section={previewData.leadPreview} />
              <SectionPreviewBlock title="Same-day preview" section={previewData.sameDayPreview} />
            </>
          ) : (
            <p className="text-sm text-slate-500">{isPreviewLoading ? "กำลังโหลด preview..." : "ยังไม่มีข้อมูล preview"}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ทดสอบรันจริงตอนนี้</CardTitle>
          <p className="text-sm text-rose-700">ส่วนนี้เป็นการรันจริง อาจมีการส่ง LINE และอัปเดต sent_at</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => runManual("lead")}
              disabled={isManualLeadLoading || isManualSameDayLoading}
              className="w-auto border-rose-200 bg-rose-50 px-5 text-rose-700 hover:bg-rose-100"
            >
              {isManualLeadLoading ? "กำลังรัน Lead..." : "ทดสอบรัน Lead ตอนนี้"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => runManual("same-day")}
              disabled={isManualLeadLoading || isManualSameDayLoading}
              className="w-auto border-rose-200 bg-rose-50 px-5 text-rose-700 hover:bg-rose-100"
            >
              {isManualSameDayLoading ? "กำลังรัน Same-day..." : "ทดสอบรัน Same-day ตอนนี้"}
            </Button>
          </div>

          {manualError ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{manualError}</div> : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {[manualLeadRunResult, manualSameDayRunResult]
              .filter(Boolean)
              .map((result) => (
                <div key={result?.route} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">ผลการรัน route: {result?.route}</p>
                  <p>targetDateUsed: {result?.targetDateUsed}</p>
                  <p>matched: {result?.matched}</p>
                  <p>sent: {result?.sent}</p>
                  <p>skipped: {result?.skipped}</p>
                  <p>skip reasons: {toSkipReasonList(result?.skipReasons ?? {})}</p>
                  <p>message: {result?.message}</p>
                  <p>เวลารันล่าสุด: {formatBangkokDateTime(result?.runAt ?? null)}</p>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>สถานะความพร้อมของระบบ</CardTitle>
          <p className="text-sm text-slate-500">สำหรับตรวจ readiness ของ env/config และ endpoint เท่านั้น (ไม่ใช่ค่าฟอร์ม)</p>
        </CardHeader>
        <CardContent>
          {previewData ? (
            <div className="space-y-3 text-sm text-slate-700">
              <p>timezone ที่ระบบใช้: {previewData.systemStatus.timezone}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className={cn("rounded-full px-2 py-0.5", statusChip(previewData.systemStatus.hasLineToken))}>LINE token</span>
                <span className={cn("rounded-full px-2 py-0.5", statusChip(previewData.systemStatus.hasLineTargetId))}>LINE target</span>
                <span className={cn("rounded-full px-2 py-0.5", statusChip(previewData.systemStatus.hasSupabaseUrl))}>SUPABASE_URL</span>
                <span className={cn("rounded-full px-2 py-0.5", statusChip(previewData.systemStatus.hasSupabaseServiceRoleKey))}>SUPABASE_SERVICE_ROLE_KEY</span>
                <span className={cn("rounded-full px-2 py-0.5", statusChip(previewData.systemStatus.routeLeadReady))}>Lead route พร้อมรัน</span>
                <span className={cn("rounded-full px-2 py-0.5", statusChip(previewData.systemStatus.routeSameDayReady))}>Same-day route พร้อมรัน</span>
              </div>
              <p>cron/manual endpoint พร้อมไหม: {previewData.systemStatus.isSystemReady ? "พร้อม" : "ยังไม่พร้อม"}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">ยังไม่มีข้อมูล readiness</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
