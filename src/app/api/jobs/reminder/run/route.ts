import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  BANGKOK_TIMEZONE,
  computeTargetOutageDate,
  formatThaiDateBE,
  getReminderSkipReason,
  isWithinScheduledWindowBangkok,
  normalizeDateOnly,
} from "@/lib/reminder";
import { getReminderSettings } from "@/lib/reminderSettings";

export const runtime = "nodejs";

type ReminderJob = {
  id: number | string;
  equipment_code: string | null;
  outage_date: string | null;
  line_reminder_sent_at: string | null;
  status?: string | null;
  is_closed?: boolean | null;
};

type Summary = {
  ok: boolean;
  targetDateUsed: string;
  totalRowsChecked: number;
  matched: number;
  sent: number;
  skipped: number;
  sampleRows: ReminderJob[];
  errors: Array<{ id?: number | string; error: string }>;
  diagnostics: {
    triggerSource: "cron-or-get" | "manual-post";
    timezone: string;
    serverTimeUtc: string;
    bangkokDateTime: string;
    requestedDateOverride: string | null;
    env: {
      hasLineToken: boolean;
      hasLineTargetId: boolean;
      hasSupabaseUrl: boolean;
      hasSupabaseServiceRoleKey: boolean;
    };
    skipReasons: Record<string, number>;
    scheduleGate: {
      enabled: boolean;
      configuredTime: string;
      nowWithinWindow: boolean;
    };
  };
};

async function fetchReminderJobs(
  supabaseUrl: string,
  serviceRoleKey: string,
  targetDate: string
): Promise<{ jobs: ReminderJob[]; statusFieldExists: boolean }> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const withStatus = await supabase
    .from("outage_jobs")
    .select("id,equipment_code,outage_date,line_reminder_sent_at,status,is_closed")
    .eq("outage_date", targetDate)
    .is("line_reminder_sent_at", null)
    .order("outage_date", { ascending: true });

  if (!withStatus.error) {
    return {
      jobs: (withStatus.data ?? []) as ReminderJob[],
      statusFieldExists: true,
    };
  }

  if (!/status|is_closed/i.test(withStatus.error.message)) {
    throw new Error(withStatus.error.message);
  }

  const withoutStatus = await supabase
    .from("outage_jobs")
    .select("id,equipment_code,outage_date,line_reminder_sent_at")
    .eq("outage_date", targetDate)
    .is("line_reminder_sent_at", null)
    .order("outage_date", { ascending: true });

  if (withoutStatus.error) {
    throw new Error(withoutStatus.error.message);
  }

  return {
    jobs: (withoutStatus.data ?? []) as ReminderJob[],
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

async function runReminder(req: NextRequest, triggerSource: "cron-or-get" | "manual-post") {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const targetId = process.env.LINE_DEFAULT_TARGET_ID;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const queryOverride = req.nextUrl.searchParams.get("date");
  const bodyOverride =
    triggerSource === "manual-post"
      ? normalizeDateOnly(String((await req.json().catch(() => ({})))?.date ?? ""))
      : null;
  const requestedDateOverride = normalizeDateOnly(queryOverride) ?? bodyOverride;

  const summary: Summary = {
    ok: true,
    targetDateUsed: "",
    totalRowsChecked: 0,
    matched: 0,
    sent: 0,
    skipped: 0,
    sampleRows: [],
    errors: [],
    diagnostics: {
      triggerSource,
      timezone: BANGKOK_TIMEZONE,
      serverTimeUtc: new Date().toISOString(),
      bangkokDateTime: new Intl.DateTimeFormat("sv-SE", {
        timeZone: BANGKOK_TIMEZONE,
        hourCycle: "h23",
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date()),
      requestedDateOverride,
      env: {
        hasLineToken: Boolean(token),
        hasLineTargetId: Boolean(targetId),
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasSupabaseServiceRoleKey: Boolean(serviceRoleKey),
      },
      skipReasons: {},
      scheduleGate: {
        enabled: true,
        configuredTime: "",
        nowWithinWindow: false,
      },
    },
  };

  const missing = [
    !token && "LINE_CHANNEL_ACCESS_TOKEN",
    !targetId && "LINE_DEFAULT_TARGET_ID",
    !supabaseUrl && "SUPABASE_URL",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ...summary,
        ok: false,
        error: "Missing required env variables",
        missing,
      },
      { status: 500 }
    );
  }

  const lineToken = token as string;
  const lineTargetId = targetId as string;
  const lineSupabaseUrl = supabaseUrl as string;
  const lineServiceRoleKey = serviceRoleKey as string;

  const addSkipReason = (reason: string) => {
    summary.skipped += 1;
    summary.diagnostics.skipReasons[reason] =
      (summary.diagnostics.skipReasons[reason] ?? 0) + 1;
  };

  try {
    console.log("reminder-settings-load-start", { route: "lead-reminder" });
    const settings = await getReminderSettings();
    console.log("reminder-settings-load-end", {
      route: "lead-reminder",
      timezone: settings.timezone,
      leadReminderEnabled: settings.lead_reminder_enabled,
      leadReminderDays: settings.lead_reminder_days,
      leadReminderTime: settings.lead_reminder_time,
    });
    const now = new Date();
    const nowWithinWindow = isWithinScheduledWindowBangkok(now, settings.lead_reminder_time);
    summary.diagnostics.scheduleGate = {
      enabled: settings.lead_reminder_enabled,
      configuredTime: settings.lead_reminder_time,
      nowWithinWindow,
    };
    console.log("reminder-schedule-check", {
      route: "lead-reminder",
      enabled: settings.lead_reminder_enabled,
      configuredTime: settings.lead_reminder_time,
      nowWithinWindow,
    });

    if (!settings.lead_reminder_enabled) {
      console.log("reminder-schedule-skip-not-time-yet", {
        route: "lead-reminder",
        reason: "lead_reminder_disabled",
      });
      return NextResponse.json({
        ...summary,
        skippedBySchedule: true,
        reason: "lead_reminder_disabled",
      });
    }

    if (!requestedDateOverride && !nowWithinWindow) {
      console.log("reminder-schedule-skip-not-time-yet", {
        route: "lead-reminder",
        configuredTime: settings.lead_reminder_time,
      });
      return NextResponse.json({
        ...summary,
        skippedBySchedule: true,
        reason: "skipped because not scheduled time",
      });
    }

    console.log("reminder-schedule-match", {
      route: "lead-reminder",
      configuredTime: settings.lead_reminder_time,
      override: Boolean(requestedDateOverride),
    });

    const targetDate = computeTargetOutageDate({
      leadDays: settings.lead_reminder_days,
      timezone: settings.timezone ?? BANGKOK_TIMEZONE,
      overrideDate: requestedDateOverride,
    });
    summary.targetDateUsed = targetDate;

    const { jobs, statusFieldExists } = await fetchReminderJobs(
      lineSupabaseUrl,
      lineServiceRoleKey,
      targetDate
    );

    summary.totalRowsChecked = jobs.length;
    summary.sampleRows = jobs.slice(0, 10);

    const matchedJobs = jobs.filter((job) => {
      const reason = getReminderSkipReason(job, targetDate, statusFieldExists);
      return reason === null;
    });

    summary.matched = matchedJobs.length;

    const supabase = createClient(lineSupabaseUrl, lineServiceRoleKey);

    for (const job of jobs) {
      const skipReason = getReminderSkipReason(job, targetDate, statusFieldExists);
      if (skipReason) {
        addSkipReason(skipReason);
        continue;
      }

      const lineText = `⚡ แจ้งเตือนเตรียมขอดับไฟ\n\nงาน: ${job.equipment_code ?? "-"}\nวันที่ดับไฟ: ${formatThaiDateBE(job.outage_date)}\n\n⏰ เหลือเวลา ${settings.lead_reminder_days} วัน\nกรุณาดำเนินการขออนุมัติดับไฟ\nเพื่อเตรียมแจ้งผู้ใช้ไฟฟ้า`;

      const lineResult = await pushLineMessage(lineToken, lineTargetId, lineText);
      console.log("[reminder] LINE push", {
        jobId: job.id,
        ok: lineResult.ok,
        status: lineResult.status,
        responseSnippet: lineResult.body.slice(0, 300),
      });

      if (!lineResult.ok) {
        summary.errors.push({
          id: job.id,
          error: `LINE push failed (${lineResult.status}): ${lineResult.body}`,
        });
        addSkipReason("line_push_failed");
        continue;
      }

      const { error: updateError } = await supabase
        .from("outage_jobs")
        .update({ line_reminder_sent_at: new Date().toISOString() })
        .eq("id", job.id)
        .is("line_reminder_sent_at", null);

      if (updateError) {
        summary.errors.push({
          id: job.id,
          error: `Failed to update line_reminder_sent_at: ${updateError.message}`,
        });
        addSkipReason("update_sent_at_failed");
        continue;
      }

      summary.sent += 1;
    }

    console.log("[reminder] summary", summary);
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ...summary,
        ok: false,
        errors: [...summary.errors, { error: message }],
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return runReminder(req, "cron-or-get");
}

export async function POST(req: NextRequest) {
  return runReminder(req, "manual-post");
}
