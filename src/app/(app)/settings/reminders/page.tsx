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

const skipReasonText: Record<string, string> = {
  already_sent: "ส่งแล้ว",
  already_sent_same_day: "ส่งแล้ว (วันปฏิบัติงาน)",
  outage_date_not_match: "วันที่งานไม่ตรงรอบ",
  "status=closed": "สถานะงานปิด",
  "status=done": "สถานะงานเสร็จสิ้น",
  "is_closed=true": "งานถูกปิด",
  dry_run_no_send: "โหมดทดสอบ (ไม่ส่งจริง)",
  line_push_failed: "ส่ง LINE ไม่สำเร็จ",
  update_sent_at_failed: "อัปเดต sent_at ไม่สำเร็จ",
  update_conflict_or_already_sent: "ข้อมูลถูกอัปเดตไปแล้ว",
};

function toSkipReasonList(map: Record<string, number>): string {
  const entries = Object.entries(map);
  if (entries.length === 0) return "-";
  return entries
    .map(([key, count]) => `${skipReasonText[key] ?? key} (${count})`)
    .join(", ");
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
  const isManualRunning = isManualLeadLoading || isManualSameDayLoading;
  const isActionLocked = isSaving || isReloading || isPreviewLoading || isManualRunning;

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
    if (isActionLocked || !isDirty) return;
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
      setSuccess("บันทึกสำเร็จ และรีเฟรชค่าที่ใช้งานจริงพร้อมตัวอย่างแล้ว");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกการตั้งค่าไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const onReloadActual = async () => {
    if (isActionLocked) return;
    if (isDirty) {
      const confirmed = window.confirm("มีแบบร่างที่ยังไม่ได้บันทึก ต้องการทิ้งและโหลดค่าที่ใช้งานจริงจากฐานข้อมูลหรือไม่?");
      if (!confirmed) return;
    }

    setError(null);
    setIsReloading(true);
    try {
      await loadActualSettings();
      setSuccess("โหลดค่าที่ใช้งานจริงจากฐานข้อมูลเรียบร้อยแล้ว");
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : "โหลดค่าจริงไม่สำเร็จ");
    } finally {
      setIsReloading(false);
    }
  };

  const runManual = async (route: "lead" | "same-day") => {
    if (isActionLocked) return;
    setManualError(null);
    setSuccess(null);

    const confirmed = window.confirm(
      `ยืนยันรันทดสอบ ${route === "lead" ? "ล่วงหน้า" : "วันปฏิบัติงาน"} ตอนนี้? การทำรายการนี้อาจมีการส่ง LINE และอัปเดต sent_at`
    );
    if (!confirmed) return;

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
      setSuccess(`รันทดสอบ ${route === "lead" ? "ล่วงหน้า" : "วันปฏิบัติงาน"} สำเร็จ และรีเฟรชข้อมูลแล้ว`);
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
        <p className={subtitleText}>จัดการแบบร่าง ค่าที่ใช้งานจริง ตัวอย่างจากฐานข้อมูล และการรันจริงในหน้าเดียว</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>ฟอร์มตั้งค่า (แบบร่าง)</CardTitle>
          <p className="text-sm text-slate-500">ค่าที่แก้ในส่วนนี้จะถูกใช้งานจริงเมื่อกดบันทึกเท่านั้น</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDirty ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ยังไม่ได้บันทึกการเปลี่ยนแปลง
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">แจ้งเตือนล่วงหน้า</p>
              <label className={cn("flex items-center gap-3", labelText)}>
                <input
                  type="checkbox"
                  checked={formSettings.lead_reminder_enabled}
                  onChange={(event) =>
                    setFormSettings((current) => ({ ...current, lead_reminder_enabled: event.target.checked }))
                  }
                />
                เปิดใช้งานแจ้งเตือนล่วงหน้า
              </label>
              <p className="text-xs text-slate-500">กำหนดการส่งแจ้งเตือนก่อนวันปฏิบัติงาน</p>

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
                เวลาแจ้งเตือนล่วงหน้า
                <Input
                  type="time"
                  value={formSettings.lead_reminder_time}
                  onChange={(event) =>
                    setFormSettings((current) => ({ ...current, lead_reminder_time: event.target.value }))
                  }
                  disabled={isInitialLoading || isSaving}
                />
              </label>
              <p className="text-xs text-slate-500">ใช้เวลาในโซน Asia/Bangkok สำหรับ cron และรันด้วยตนเอง</p>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">แจ้งเตือนวันปฏิบัติงาน</p>
              <label className={cn("flex items-center gap-3", labelText)}>
                <input
                  type="checkbox"
                  checked={formSettings.same_day_reminder_enabled}
                  onChange={(event) =>
                    setFormSettings((current) => ({ ...current, same_day_reminder_enabled: event.target.checked }))
                  }
                />
                เปิดใช้งานแจ้งเตือนวันปฏิบัติงาน
              </label>
              <p className="text-xs text-slate-500">กำหนดการส่งแจ้งเตือนในวันปฏิบัติงานจริง</p>

              <label className={cn("flex flex-col gap-2", labelText)}>
                เวลาแจ้งเตือนวันปฏิบัติงาน
                <Input
                  type="time"
                  value={formSettings.same_day_reminder_time}
                  onChange={(event) =>
                    setFormSettings((current) => ({ ...current, same_day_reminder_time: event.target.value }))
                  }
                  disabled={isInitialLoading || isSaving}
                />
              </label>
              <p className="text-xs text-slate-500">ทำงานผ่าน route คนละชุดกับการแจ้งเตือนล่วงหน้า</p>

              <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700">
                โซนเวลาที่ระบบใช้งานจริง: <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">Asia/Bangkok</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Action bar</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={onSave} disabled={isInitialLoading || isActionLocked || !isDirty} className="w-auto px-5">
                {isSaving ? "กำลังบันทึก..." : "บันทึกแบบร่าง"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onReloadActual}
                disabled={isInitialLoading || isActionLocked}
                className="w-auto px-5"
              >
                {isReloading ? "กำลังโหลด..." : "โหลดค่าที่ใช้งานจริง"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={loadPreview}
                disabled={isInitialLoading || isActionLocked}
                className="w-auto px-5"
              >
                {isPreviewLoading ? "กำลังคำนวณ..." : "โหลดตัวอย่างจากค่าที่บันทึกแล้ว"}
              </Button>
            </div>
            <p className="text-xs text-slate-500">ตัวอย่างและการรันจริงจะอ่านค่าจากฐานข้อมูลเท่านั้น</p>
            {isDirty ? (
              <p className="text-xs text-amber-700">หากกด “โหลดค่าที่ใช้งานจริง” ระบบจะทิ้งแบบร่างที่ยังไม่ได้บันทึก</p>
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
          <p className="text-sm text-slate-500">ข้อมูลจากฐานข้อมูลชุดนี้คือค่าที่ cron และ manual run ใช้งานจริง</p>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          <p>Lead reminder: {actualSettings.lead_reminder_enabled ? "เปิด" : "ปิด"}</p>
          <p>Lead days: {actualSettings.lead_reminder_days} วัน</p>
          <p>Lead time: {actualSettings.lead_reminder_time}</p>
          <p>Same-day reminder: {actualSettings.same_day_reminder_enabled ? "เปิด" : "ปิด"}</p>
          <p>Same-day time: {actualSettings.same_day_reminder_time}</p>
          <p>Timezone: {actualSettings.timezone}</p>
          <p>แหล่งข้อมูล: database</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ตัวอย่างการแจ้งเตือน</CardTitle>
          <p className="text-sm text-slate-500">ประมวลผลจากค่าที่บันทึกแล้วในฐานข้อมูล</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewData ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                อัปเดตล่าสุด: {formatBangkokDateTime(previewData.generatedAt)} · รอบถัดไป (ล่วงหน้า): {formatBangkokDateTime(previewData.systemStatus.nextLeadRunAt)} · รอบถัดไป (วันปฏิบัติงาน): {formatBangkokDateTime(previewData.systemStatus.nextSameDayRunAt)}
              </div>
              <SectionPreviewBlock title="ตัวอย่างแจ้งเตือนล่วงหน้า" section={previewData.leadPreview} />
              <SectionPreviewBlock title="ตัวอย่างแจ้งเตือนวันปฏิบัติงาน" section={previewData.sameDayPreview} />
            </>
          ) : (
            <p className="text-sm text-slate-500">{isPreviewLoading ? "กำลังโหลดตัวอย่าง..." : "ยังไม่มีข้อมูลตัวอย่าง"}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ทดสอบรันจริง</CardTitle>
          <p className="text-sm text-rose-700">คำสั่งนี้อาจมีการส่ง LINE และอัปเดต sent_at</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => runManual("lead")}
              disabled={isActionLocked}
              className="w-auto border-rose-200 bg-rose-50 px-5 text-rose-700 hover:bg-rose-100"
            >
              {isManualLeadLoading ? "กำลังรันล่วงหน้า..." : "รันทดสอบล่วงหน้า"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => runManual("same-day")}
              disabled={isActionLocked}
              className="w-auto border-rose-200 bg-rose-50 px-5 text-rose-700 hover:bg-rose-100"
            >
              {isManualSameDayLoading ? "กำลังรันวันปฏิบัติงาน..." : "รันทดสอบวันปฏิบัติงาน"}
            </Button>
          </div>

          {manualError ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{manualError}</div> : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {[manualLeadRunResult, manualSameDayRunResult]
              .filter(Boolean)
              .map((result) => (
                <div key={result?.route} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">
                    ผลการรัน: {result?.route === "lead" ? "แจ้งเตือนล่วงหน้า" : "แจ้งเตือนวันปฏิบัติงาน"}
                  </p>
                  <p>
                    สถานะ:{" "}
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", statusChip(Boolean(result?.ok)))}>
                      {result?.ok ? "สำเร็จ" : "ไม่สำเร็จ"}
                    </span>
                  </p>
                  <p>targetDateUsed: {result?.targetDateUsed || "-"}</p>
                  <p>matched: {result?.matched ?? 0}</p>
                  <p>sent: {result?.sent ?? 0}</p>
                  <p>skipped: {result?.skipped ?? 0}</p>
                  <p>เหตุผลที่ข้าม: {toSkipReasonList(result?.skipReasons ?? {})}</p>
                  <p>ข้อความระบบ: {result?.message || "-"}</p>
                  <p>เวลารันล่าสุด: {formatBangkokDateTime(result?.runAt ?? null)}</p>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>สถานะความพร้อมของระบบ</CardTitle>
          <p className="text-sm text-slate-500">สำหรับตรวจสถานะความพร้อมของระบบจาก env/config และ endpoint</p>
        </CardHeader>
        <CardContent>
          {previewData ? (
            <div className="space-y-3 text-sm text-slate-700">
              <p>โซนเวลาระบบ: {previewData.systemStatus.timezone}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className={cn("rounded-full px-2 py-0.5", statusChip(previewData.systemStatus.hasLineToken))}>LINE token</span>
                <span className={cn("rounded-full px-2 py-0.5", statusChip(previewData.systemStatus.hasLineTargetId))}>LINE target</span>
                <span className={cn("rounded-full px-2 py-0.5", statusChip(previewData.systemStatus.hasSupabaseUrl))}>SUPABASE_URL</span>
                <span className={cn("rounded-full px-2 py-0.5", statusChip(previewData.systemStatus.hasSupabaseServiceRoleKey))}>SUPABASE_SERVICE_ROLE_KEY</span>
                <span className={cn("rounded-full px-2 py-0.5", statusChip(previewData.systemStatus.routeLeadReady))}>Lead route พร้อมรัน</span>
                <span className={cn("rounded-full px-2 py-0.5", statusChip(previewData.systemStatus.routeSameDayReady))}>Same-day route พร้อมรัน</span>
              </div>
              <p>ความพร้อมรวมสำหรับ cron/manual: {previewData.systemStatus.isSystemReady ? "พร้อมใช้งาน" : "ยังไม่พร้อมใช้งาน"}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">ยังไม่มีข้อมูล readiness</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
