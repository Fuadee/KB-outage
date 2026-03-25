import { SupabaseClient } from "@supabase/supabase-js";
import {
  BANGKOK_TIMEZONE,
  computeBangkokTodayDateOnly,
  computeTargetOutageDate,
  formatLeadReminderMessage,
  formatSameDayReminderMessage,
  getReminderSkipReason,
  getSameDayReminderSkipReason,
  normalizeDateOnly,
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
  wouldSend: boolean;
  skipReason: string | null;
  messagePreview: string;
};

export type ReminderPreviewSection = {
  enabled: boolean;
  targetDate: string;
  matched: number;
  eligible: number;
  skipped: number;
  items: ReminderPreviewItem[];
};

export type ReminderPreviewResponse = {
  ok: true;
  generatedAt: string;
  timezone: string;
  settings: Pick<
    ReminderSettings,
    "lead_reminder_enabled" | "lead_reminder_days" | "same_day_reminder_enabled"
  >;
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

export function buildPreviewSection(options: {
  enabled: boolean;
  targetDate: string;
  jobs: PreviewJob[];
  statusFieldExists: boolean;
  getSkipReason: (job: PreviewJob, targetDate: string, statusFieldExists: boolean) => string | null;
  formatMessage: (job: PreviewJob) => string;
}): ReminderPreviewSection {
  const items: ReminderPreviewItem[] = options.jobs.map((job) => {
    const reason = options.getSkipReason(job, options.targetDate, options.statusFieldExists);
    const skipReason = !options.enabled ? "reminder_disabled" : reason;

    return {
      id: job.id,
      equipment_code: job.equipment_code,
      outage_date: normalizeDateOnly(job.outage_date),
      wouldSend: skipReason === null,
      skipReason,
      messagePreview: options.formatMessage(job),
    };
  });

  const eligible = items.filter((item) => item.wouldSend).length;

  return {
    enabled: options.enabled,
    targetDate: options.targetDate,
    matched: items.length,
    eligible,
    skipped: items.length - eligible,
    items,
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

  const leadTargetDate = computeTargetOutageDate({
    now,
    leadDays: settings.lead_reminder_days,
    timezone: settings.timezone ?? BANGKOK_TIMEZONE,
    overrideDate: previewDate,
  });
  const sameDayTargetDate = previewDate ?? computeBangkokTodayDateOnly(now);

  const leadRows = await fetchPreviewJobsByDate(options.supabase, leadTargetDate);
  const sameDayRows = await fetchPreviewJobsByDate(options.supabase, sameDayTargetDate);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    timezone: settings.timezone ?? BANGKOK_TIMEZONE,
    settings: {
      lead_reminder_enabled: settings.lead_reminder_enabled,
      lead_reminder_days: settings.lead_reminder_days,
      same_day_reminder_enabled: settings.same_day_reminder_enabled,
    },
    leadPreview: buildPreviewSection({
      enabled: settings.lead_reminder_enabled,
      targetDate: leadTargetDate,
      jobs: leadRows.jobs,
      statusFieldExists: leadRows.statusFieldExists,
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
      jobs: sameDayRows.jobs,
      statusFieldExists: sameDayRows.statusFieldExists,
      getSkipReason: getSameDayReminderSkipReason,
      formatMessage: (job) =>
        formatSameDayReminderMessage({
          equipmentCode: job.equipment_code,
          outageDate: job.outage_date,
        }),
    }),
  };
}
