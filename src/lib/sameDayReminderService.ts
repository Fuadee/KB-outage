import { createClient } from "@supabase/supabase-js";
import {
  BANGKOK_TIMEZONE,
  computeBangkokTodayDateOnly,
  formatSameDayReminderMessage,
  getReminderMissingEnvKeys,
  getReminderRuntimeReadiness,
  getSameDayReminderSkipReason,
  normalizeDateOnly,
} from "@/lib/reminder";
import { reminderConfig } from "@/lib/reminderConfig";

export type SameDayReminderJob = {
  id: number | string;
  equipment_code: string | null;
  outage_date: string | null;
  map_link?: string | null;
  line_same_day_reminder_sent_at: string | null;
  status?: string | null;
  is_closed?: boolean | null;
};

export type SameDayReminderRunInput = {
  date?: string | null;
  dryRun?: boolean;
  trigger: "external-get" | "external-post";
};

export type SameDayReminderRunSummary = {
  ok: boolean;
  nowUtc: string;
  nowBangkok: string;
  targetDateUsed: string;
  dryRun: boolean;
  totalRowsChecked: number;
  matched: number;
  sent: number;
  skipped: number;
  skipReasons: Record<string, number>;
  sampleRows: Array<{
    id: number | string;
    equipment_code: string | null;
    outage_date: string | null;
    status: string | null;
    line_same_day_reminder_sent_at: string | null;
  }>;
  lineSendAttempts: number;
  lineSendFailures: number;
  updatedRows: number;
  trigger: SameDayReminderRunInput["trigger"];
  errors: Array<{ id?: number | string; error: string }>;
};

async function fetchSameDayReminderJobs(
  supabaseUrl: string,
  serviceRoleKey: string,
  targetDate: string
): Promise<{ jobs: SameDayReminderJob[]; statusFieldExists: boolean }> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const withStatus = await supabase
    .from("outage_jobs")
    .select("id,equipment_code,outage_date,map_link,line_same_day_reminder_sent_at,status,is_closed")
    .eq("outage_date", targetDate)
    .order("outage_date", { ascending: true });

  if (!withStatus.error) {
    return {
      jobs: (withStatus.data ?? []) as SameDayReminderJob[],
      statusFieldExists: true,
    };
  }

  if (!/status|is_closed/i.test(withStatus.error.message)) {
    throw new Error(withStatus.error.message);
  }

  const withoutStatus = await supabase
    .from("outage_jobs")
    .select("id,equipment_code,outage_date,map_link,line_same_day_reminder_sent_at")
    .eq("outage_date", targetDate)
    .order("outage_date", { ascending: true });

  if (withoutStatus.error) {
    throw new Error(withoutStatus.error.message);
  }

  return {
    jobs: (withoutStatus.data ?? []) as SameDayReminderJob[],
    statusFieldExists: false,
  };
}

async function pushLineMessage(token: string, to: string, text: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
  });

  return {
    ok: res.ok,
    status: res.status,
    body: await res.text(),
  };
}

function formatBangkokDateTime(now: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: BANGKOK_TIMEZONE,
    hourCycle: "h23",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(now);
}

export async function runSameDayReminder(
  input: SameDayReminderRunInput
): Promise<{ summary: SameDayReminderRunSummary; status: number }> {
  const now = new Date();
  const nowUtc = now.toISOString();
  const nowBangkok = formatBangkokDateTime(now);

  const summary: SameDayReminderRunSummary = {
    ok: true,
    nowUtc,
    nowBangkok,
    targetDateUsed: normalizeDateOnly(input.date) ?? computeBangkokTodayDateOnly(now),
    dryRun: Boolean(input.dryRun),
    totalRowsChecked: 0,
    matched: 0,
    sent: 0,
    skipped: 0,
    skipReasons: {},
    sampleRows: [],
    lineSendAttempts: 0,
    lineSendFailures: 0,
    updatedRows: 0,
    trigger: input.trigger,
    errors: [],
  };

  const addSkipReason = (reason: string) => {
    summary.skipped += 1;
    summary.skipReasons[reason] = (summary.skipReasons[reason] ?? 0) + 1;
  };

  const runtimeReadiness = getReminderRuntimeReadiness();
  const missing = getReminderMissingEnvKeys(runtimeReadiness);
  if (missing.length > 0) {
    console.error("same-day-reminder-missing-env", { nowUtc: summary.nowUtc, trigger: summary.trigger, missing });
    return {
      status: 500,
      summary: {
        ...summary,
        ok: false,
        errors: [{ error: `Missing required env variables: ${missing.join(", ")}` }],
      },
    };
  }

  if (!reminderConfig.allowSameDayReminder) {
    console.warn("same-day-reminder-disabled", { nowUtc: summary.nowUtc, trigger: summary.trigger });
    addSkipReason("same_day_reminder_disabled");
    return {
      status: 200,
      summary,
    };
  }

  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN as string;
  const lineTargetId = process.env.LINE_DEFAULT_TARGET_ID as string;
  const lineSupabaseUrl = process.env.SUPABASE_URL as string;
  const lineServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

  try {
    const { jobs, statusFieldExists } = await fetchSameDayReminderJobs(
      lineSupabaseUrl,
      lineServiceRoleKey,
      summary.targetDateUsed
    );

    summary.totalRowsChecked = jobs.length;

    console.log("same-day-reminder-query-result", {
      nowUtc: summary.nowUtc,
      targetDateUsed: summary.targetDateUsed,
      totalRowsChecked: summary.totalRowsChecked,
      statusFieldExists,
      trigger: summary.trigger,
    });
    summary.sampleRows = jobs.slice(0, 10).map((job) => ({
      id: job.id,
      equipment_code: job.equipment_code,
      outage_date: job.outage_date,
      status: job.status ?? null,
      line_same_day_reminder_sent_at: job.line_same_day_reminder_sent_at,
    }));

    const supabase = createClient(lineSupabaseUrl, lineServiceRoleKey);

    for (const job of jobs) {
      const skipReason = getSameDayReminderSkipReason(job, summary.targetDateUsed, statusFieldExists);
      if (skipReason) {
        addSkipReason(skipReason);
        continue;
      }

      summary.matched += 1;

      if (summary.dryRun) {
        addSkipReason("dry_run_no_send");
        continue;
      }

      const lineText = formatSameDayReminderMessage({
        equipmentCode: job.equipment_code,
        outageDate: job.outage_date,
        mapLink: job.map_link,
      });

      summary.lineSendAttempts += 1;

      const lineResult = await pushLineMessage(lineToken, lineTargetId, lineText).catch((error) => ({
        ok: false,
        status: 0,
        body: error instanceof Error ? error.message : "Unknown LINE push error",
      }));

      if (!lineResult.ok) {
        summary.lineSendFailures += 1;
        summary.errors.push({ id: job.id, error: `LINE push failed (${lineResult.status}): ${lineResult.body}` });
        addSkipReason("line_push_failed");
        continue;
      }

      const { data: updatedRows, error: updateError } = await supabase
        .from("outage_jobs")
        .update({ line_same_day_reminder_sent_at: new Date().toISOString() })
        .eq("id", job.id)
        .is("line_same_day_reminder_sent_at", null)
        .select("id");

      if (updateError) {
        summary.errors.push({
          id: job.id,
          error: `Failed to update line_same_day_reminder_sent_at: ${updateError.message}`,
        });
        addSkipReason("update_sent_at_failed");
        continue;
      }

      if (!updatedRows || updatedRows.length === 0) {
        addSkipReason("update_conflict_or_already_sent");
        continue;
      }

      summary.updatedRows += updatedRows.length;
      summary.sent += 1;
    }

    console.log("same-day-reminder-run", {
      nowUtc: summary.nowUtc,
      nowBangkok: summary.nowBangkok,
      targetDateUsed: summary.targetDateUsed,
      dryRun: summary.dryRun,
      totalRowsChecked: summary.totalRowsChecked,
      matched: summary.matched,
      sent: summary.sent,
      skipped: summary.skipped,
      skipReasons: summary.skipReasons,
      sampleRows: summary.sampleRows,
      lineSendAttempts: summary.lineSendAttempts,
      lineSendFailures: summary.lineSendFailures,
      updatedRows: summary.updatedRows,
      trigger: summary.trigger,
      errors: summary.errors,
    });

    return { status: 200, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("same-day-reminder-run-failed", {
      nowUtc: summary.nowUtc,
      targetDateUsed: summary.targetDateUsed,
      trigger: summary.trigger,
      error: message,
    });
    return {
      status: 500,
      summary: {
        ...summary,
        ok: false,
        errors: [...summary.errors, { error: message }],
      },
    };
  }
}
