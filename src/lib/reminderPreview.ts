import { SupabaseClient } from "@supabase/supabase-js";
import {
  BANGKOK_TIMEZONE,
  computeBangkokTodayDateOnly,
  computeLeadPlannedNotifyDate,
  computeNextScheduledRunAt,
  computeSameDayPlannedNotifyDate,
  computeTargetOutageDate,
  deriveReminderReadinessStatus,
  formatLeadReminderMessage,
  formatPlannedNotifyThaiDateTime,
  formatSameDayReminderMessage,
  getReminderSkipReason,
  getSameDayReminderSkipReason,
  normalizeDateOnly,
  type ReminderReadinessStatus,
} from "./reminder.ts";
import { getReminderSettings } from "./reminderSettings.ts";
import type { ReminderSettings } from "./reminderSettings.ts";

export type PreviewJob = {
  id: number | string;
  equipment_code: string | null;
  outage_date: string | null;
  line_reminder_sent_at: string | null;
  line_same_day_reminder_sent_at: string | null;
  status?: string | null;
  is_closed?: boolean | null;
};

export type ReminderPreviewItem = {
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

export type ReminderPreviewSection = {
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

export type ReminderSystemStatus = {
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

export type ReminderPreviewResponse = {
  ok: true;
  generatedAt: string;
  timezone: string;
  settingsDebug: {
    lead_reminder_time_from_db: string;
    same_day_reminder_time_from_db: string;
    source: "database";
  };
  settings: Pick<
    ReminderSettings,
    "lead_reminder_enabled" | "lead_reminder_days" | "same_day_reminder_enabled"
  >;
  systemStatus: ReminderSystemStatus;
  leadPreview: ReminderPreviewSection;
  sameDayPreview: ReminderPreviewSection;
};

async function fetchPreviewJobsByDate(
  supabase: SupabaseClient,
  targetDate: string
): Promise<{ jobs: PreviewJob[]; statusFieldExists: boolean }> {
  const withStatus = await supabase
    .from("outage_jobs")
    .select(
      "id,equipment_code,outage_date,line_reminder_sent_at,line_same_day_reminder_sent_at,status,is_closed"
    )
    .eq("outage_date", targetDate)
    .order("outage_date", { ascending: true });

  if (!withStatus.error) {
    return {
      jobs: (withStatus.data ?? []) as PreviewJob[],
      statusFieldExists: true,
    };
  }

  if (!/status|is_closed/i.test(withStatus.error.message)) {
    throw new Error(withStatus.error.message);
  }

  const withoutStatus = await supabase
    .from("outage_jobs")
    .select("id,equipment_code,outage_date,line_reminder_sent_at,line_same_day_reminder_sent_at")
    .eq("outage_date", targetDate)
    .order("outage_date", { ascending: true });

  if (withoutStatus.error) {
    throw new Error(withoutStatus.error.message);
  }

  return {
    jobs: (withoutStatus.data ?? []) as PreviewJob[],
    statusFieldExists: false,
  };
}

function toPlannedNotifyAt(dateText: string | null, timeText: string): string | null {
  if (!dateText) return null;
  return `${dateText}T${timeText}:00+07:00`;
}

function toSkipReasonText(skipReason: string | null): string | null {
  if (!skipReason) return null;
  const map: Record<string, string> = {
    reminder_disabled: "ปิดการแจ้งเตือนใน settings",
    already_sent: "ส่งแจ้งเตือนล่วงหน้าไปแล้ว",
    already_sent_same_day: "ส่งแจ้งเตือนวันจริงไปแล้ว",
    "status=closed": "งานสถานะปิดแล้ว",
    "status=done": "งานเสร็จแล้ว",
    "is_closed=true": "งานถูกปิดแล้ว",
    outage_date_not_match: "outage_date ไม่ตรงรอบนี้",
    not_due_yet: "ยังไม่ถึงวันแจ้งเตือน",
  };
  return map[skipReason] ?? skipReason;
}

function toReadinessReason(options: {
  readinessStatus: ReminderReadinessStatus;
  skipReason: string | null;
  plannedNotifyDate: string | null;
  plannedNotifyTime: string;
}): string {
  const plannedText = formatPlannedNotifyThaiDateTime(
    options.plannedNotifyDate,
    options.plannedNotifyTime
  );

  if (options.readinessStatus === "disabled") {
    return "flow นี้ถูกปิดจากการตั้งค่า";
  }

  if (options.readinessStatus === "sent") {
    return "ส่งแล้ว";
  }

  if (options.readinessStatus === "ready_today") {
    return `ถึงวันแจ้งเตือนแล้ว (${plannedText})`;
  }

  if (options.readinessStatus === "scheduled") {
    return `ยังไม่ถึงวันแจ้งเตือน ระบบจะส่งในวันที่ ${plannedText}`;
  }

  return toSkipReasonText(options.skipReason) ?? "งานถูกข้ามจากเงื่อนไขระบบ";
}

export function buildPreviewSection(options: {
  enabled: boolean;
  targetDate: string;
  scheduleTime: string;
  nextRunAt: string | null;
  summaryText: string;
  jobs: PreviewJob[];
  statusFieldExists: boolean;
  todayDate: string;
  notificationType: "lead" | "same_day";
  leadDays: number;
  getSkipReason: (job: PreviewJob, targetDate: string, statusFieldExists: boolean) => string | null;
  formatMessage: (job: PreviewJob) => string;
}): ReminderPreviewSection {
  const items: ReminderPreviewItem[] = options.jobs.map((job) => {
    const rawSkipReason = options.getSkipReason(job, options.targetDate, options.statusFieldExists);
    const isSent =
      options.notificationType === "lead"
        ? Boolean(job.line_reminder_sent_at)
        : Boolean(job.line_same_day_reminder_sent_at);

    const plannedNotifyDate =
      options.notificationType === "lead"
        ? computeLeadPlannedNotifyDate(job.outage_date, options.leadDays)
        : computeSameDayPlannedNotifyDate(job.outage_date);

    const inferredSkipReason =
      !rawSkipReason && plannedNotifyDate && plannedNotifyDate > options.todayDate
        ? "not_due_yet"
        : rawSkipReason;

    const skipReason = !options.enabled ? "reminder_disabled" : inferredSkipReason;
    const readinessStatus = deriveReminderReadinessStatus({
      enabled: options.enabled,
      plannedNotifyDate,
      todayDate: options.todayDate,
      isSent,
      skipReason,
    });

    return {
      id: job.id,
      equipment_code: job.equipment_code,
      outage_date: normalizeDateOnly(job.outage_date),
      notificationType: options.notificationType,
      plannedNotifyDate,
      plannedNotifyTime: options.scheduleTime,
      plannedNotifyAt: toPlannedNotifyAt(plannedNotifyDate, options.scheduleTime),
      readinessStatus,
      readinessReason: toReadinessReason({
        readinessStatus,
        skipReason,
        plannedNotifyDate,
        plannedNotifyTime: options.scheduleTime,
      }),
      wouldSend: skipReason === null,
      skipReason,
      messagePreview: options.formatMessage(job),
    };
  });

  const eligible = items.filter((item) => item.wouldSend).length;

  return {
    enabled: options.enabled,
    targetDate: options.targetDate,
    scheduleTime: options.scheduleTime,
    nextRunAt: options.nextRunAt,
    summaryText: options.summaryText,
    matched: items.length,
    eligible,
    skipped: items.length - eligible,
    items,
  };
}

function buildSystemStatus(options: {
  timezone: string;
  leadReminderScheduleTime: string;
  sameDayReminderScheduleTime: string;
  now?: Date;
}): ReminderSystemStatus {
  const hasLineToken = Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN);
  const hasLineTargetId = Boolean(process.env.LINE_TARGET_USER_ID || process.env.LINE_TARGET_GROUP_ID);
  const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL);
  const hasSupabaseServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const nextLeadRunAt = computeNextScheduledRunAt({
    now: options.now,
    scheduleTime: options.leadReminderScheduleTime,
    timezone: options.timezone,
  });
  const nextSameDayRunAt = computeNextScheduledRunAt({
    now: options.now,
    scheduleTime: options.sameDayReminderScheduleTime,
    timezone: options.timezone,
  });

  return {
    isSystemReady:
      hasLineToken && hasLineTargetId && hasSupabaseUrl && hasSupabaseServiceRoleKey,
    hasLineToken,
    hasLineTargetId,
    hasSupabaseUrl,
    hasSupabaseServiceRoleKey,
    leadReminderScheduleTime: options.leadReminderScheduleTime,
    sameDayReminderScheduleTime: options.sameDayReminderScheduleTime,
    nextLeadRunAt,
    nextSameDayRunAt,
  };
}

export async function buildReminderPreview(options: {
  supabase: SupabaseClient;
  previewDate?: string | null;
  now?: Date;
}): Promise<ReminderPreviewResponse> {
  const settings = await getReminderSettings(options.supabase);
  const previewDate = normalizeDateOnly(options.previewDate ?? null);
  const now = options.now;
  const timezone = settings.timezone ?? BANGKOK_TIMEZONE;
  const todayDate = computeBangkokTodayDateOnly(now);

  const leadTargetDate = computeTargetOutageDate({
    now,
    leadDays: settings.lead_reminder_days,
    timezone,
    overrideDate: previewDate,
  });
  const sameDayTargetDate = previewDate ?? todayDate;

  const leadRows = await fetchPreviewJobsByDate(options.supabase, leadTargetDate);
  const sameDayRows = await fetchPreviewJobsByDate(options.supabase, sameDayTargetDate);

  const generatedAt = (now ?? new Date()).toISOString();
  const systemStatus = buildSystemStatus({
    timezone,
    leadReminderScheduleTime: settings.lead_reminder_time,
    sameDayReminderScheduleTime: settings.same_day_reminder_time,
    now,
  });

  return {
    ok: true,
    generatedAt,
    timezone,
    settingsDebug: {
      lead_reminder_time_from_db: settings.lead_reminder_time,
      same_day_reminder_time_from_db: settings.same_day_reminder_time,
      source: "database",
    },
    settings: {
      lead_reminder_enabled: settings.lead_reminder_enabled,
      lead_reminder_days: settings.lead_reminder_days,
      same_day_reminder_enabled: settings.same_day_reminder_enabled,
    },
    systemStatus,
    leadPreview: buildPreviewSection({
      enabled: settings.lead_reminder_enabled,
      targetDate: leadTargetDate,
      scheduleTime: settings.lead_reminder_time,
      nextRunAt: systemStatus.nextLeadRunAt,
      summaryText: `ระบบจะตรวจงานวันที่ ${leadTargetDate} และส่งแจ้งเตือนในรอบ ${settings.lead_reminder_time} ของแต่ละวัน`,
      jobs: leadRows.jobs,
      statusFieldExists: leadRows.statusFieldExists,
      todayDate,
      notificationType: "lead",
      leadDays: settings.lead_reminder_days,
      getSkipReason: getReminderSkipReason,
      formatMessage: (job) =>
        formatLeadReminderMessage({
          equipmentCode: job.equipment_code,
          outageDate: job.outage_date,
          leadDays: settings.lead_reminder_days,
        }),
    }),
    sameDayPreview: buildPreviewSection({
      enabled: settings.same_day_reminder_enabled,
      targetDate: sameDayTargetDate,
      scheduleTime: settings.same_day_reminder_time,
      nextRunAt: systemStatus.nextSameDayRunAt,
      summaryText: `ระบบจะตรวจงานวันที่ ${sameDayTargetDate} และส่งแจ้งเตือนในรอบ ${settings.same_day_reminder_time} ของแต่ละวัน`,
      jobs: sameDayRows.jobs,
      statusFieldExists: sameDayRows.statusFieldExists,
      todayDate,
      notificationType: "same_day",
      leadDays: settings.lead_reminder_days,
      getSkipReason: getSameDayReminderSkipReason,
      formatMessage: (job) =>
        formatSameDayReminderMessage({
          equipmentCode: job.equipment_code,
          outageDate: job.outage_date,
        }),
    }),
  };
}
