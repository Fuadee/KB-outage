import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  BANGKOK_TIMEZONE,
  computeTargetOutageDate,
  formatLeadReminderMessage,
  getReminderRuntimeReadiness,
  getReminderSkipReason,
  normalizeDateOnly,
} from "@/lib/reminder";
import { getReminderSettings } from "@/lib/reminderSettings";
import { createServerClient, getAuthTokens } from "@/lib/supabase/server";

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
  matchedRows: ReminderJob[];
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
    leadReminderEnabled: boolean;
    leadReminderDays: number;
    dryRun: boolean;
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

  const requestBody =
    triggerSource === "manual-post"
      ? await req.json().catch(() => ({}))
      : {};
  const queryOverride = req.nextUrl.searchParams.get("date");
  const bodyOverride = normalizeDateOnly(String((requestBody as { date?: string })?.date ?? ""));
  const dryRun =
    triggerSource === "manual-post"
      ? Boolean((requestBody as { dryRun?: boolean | number | string })?.dryRun)
      : req.nextUrl.searchParams.get("dryRun") === "1";
  const requestedDateOverride = normalizeDateOnly(queryOverride) ?? bodyOverride;

  const summary: Summary = {
    ok: true,
    targetDateUsed: "",
    totalRowsChecked: 0,
    matched: 0,
    sent: 0,
    skipped: 0,
    sampleRows: [],
    matchedRows: [],
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
      leadReminderEnabled: true,
      leadReminderDays: 5,
      dryRun,
    },
  };

  if (triggerSource === "manual-post") {
    const { accessToken } = getAuthTokens();
    if (!accessToken) {
      return NextResponse.json(
        { ...summary, ok: false, error: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const authClient = createServerClient();
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { ...summary, ok: false, error: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }
  }

  if (triggerSource === "manual-post") {
    console.log("reminder-manual-run-start", {
      route: "lead-reminder",
      requestedDateOverride,
      dryRun,
    });
  }

  console.log("reminder-route-start", {
    route: "lead-reminder",
    triggerSource,
    method: req.method,
    requestedDateOverride,
  });

  const runtimeReadiness = getReminderRuntimeReadiness();
  const missing = [
    !runtimeReadiness.hasLineToken && "LINE_CHANNEL_ACCESS_TOKEN",
    !runtimeReadiness.hasLineTargetId && "LINE_DEFAULT_TARGET_ID",
    !runtimeReadiness.hasSupabaseUrl && "SUPABASE_URL",
    !runtimeReadiness.hasSupabaseServiceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
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
    const settings = await getReminderSettings();
    summary.diagnostics.leadReminderEnabled = settings.lead_reminder_enabled;
    summary.diagnostics.leadReminderDays = settings.lead_reminder_days;

    if (!settings.lead_reminder_enabled) {
      console.log("reminder-route-end", {
        route: "lead-reminder",
        reason: "lead_reminder_disabled",
        sent: 0,
        skipped: 0,
      });
      return NextResponse.json({
        ...summary,
        skippedBySchedule: true,
        reason: "lead_reminder_disabled",
      });
    }

    const targetDate = computeTargetOutageDate({
      leadDays: settings.lead_reminder_days,
      timezone: settings.timezone ?? BANGKOK_TIMEZONE,
      overrideDate: requestedDateOverride,
    });
    summary.targetDateUsed = targetDate;
    console.log("reminder-target-date", { route: "lead-reminder", targetDate });

    const { jobs, statusFieldExists } = await fetchReminderJobs(
      lineSupabaseUrl,
      lineServiceRoleKey,
      targetDate
    );

    summary.totalRowsChecked = jobs.length;
    summary.sampleRows = jobs.slice(0, 10);
    console.log("reminder-total-rows", {
      route: "lead-reminder",
      targetDate,
      totalRows: jobs.length,
    });

    const matchedJobs = jobs.filter((job) => {
      const reason = getReminderSkipReason(job, targetDate, statusFieldExists);
      return reason === null;
    });

    summary.matched = matchedJobs.length;
    summary.matchedRows = matchedJobs.slice(0, 50);

    const supabase = createClient(lineSupabaseUrl, lineServiceRoleKey);

    for (const job of jobs) {
      const skipReason = getReminderSkipReason(job, targetDate, statusFieldExists);
      if (skipReason) {
        addSkipReason(skipReason);
        continue;
      }

      const lineText = formatLeadReminderMessage({
        equipmentCode: job.equipment_code,
        outageDate: job.outage_date,
        leadDays: settings.lead_reminder_days,
      });

      if (!dryRun) {
        const lineResult = await pushLineMessage(lineToken, lineTargetId, lineText);
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
      }

      summary.sent += 1;
    }

    console.log("reminder-sent-count", { route: "lead-reminder", sent: summary.sent });
    console.log("reminder-skipped-count", {
      route: "lead-reminder",
      skipped: summary.skipped,
      skipReasons: summary.diagnostics.skipReasons,
    });
    console.log("reminder-route-end", {
      route: "lead-reminder",
      ok: summary.ok,
      targetDate: summary.targetDateUsed,
      sent: summary.sent,
      skipped: summary.skipped,
      totalRows: summary.totalRowsChecked,
    });

    if (triggerSource === "manual-post") {
      console.log("reminder-manual-run-success", {
        route: "lead-reminder",
        targetDate: summary.targetDateUsed,
        dryRun,
        sent: summary.sent,
        matched: summary.matched,
      });
      console.log("reminder-manual-run-end", {
        route: "lead-reminder",
        ok: true,
        dryRun,
      });
    }

    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log("reminder-route-end", {
      route: "lead-reminder",
      ok: false,
      error: message,
      sent: summary.sent,
      skipped: summary.skipped,
    });

    if (triggerSource === "manual-post") {
      console.log("reminder-manual-run-failed", {
        route: "lead-reminder",
        dryRun,
        error: message,
      });
      console.log("reminder-manual-run-end", {
        route: "lead-reminder",
        ok: false,
        dryRun,
      });
    }

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
