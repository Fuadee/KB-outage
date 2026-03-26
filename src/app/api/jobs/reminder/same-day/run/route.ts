import { NextRequest, NextResponse } from "next/server";
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
import { getReminderSettings } from "@/lib/reminderSettings";
import { createServerClient, getAuthTokens } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SameDayReminderJob = {
  id: number | string;
  equipment_code: string | null;
  outage_date: string | null;
  map_link?: string | null;
  line_same_day_reminder_sent_at: string | null;
  status?: string | null;
  is_closed?: boolean | null;
};

type Summary = {
  ok: boolean;
  mode: "normal" | "dryRun" | "forceSend";
  targetDateUsed: string;
  totalRowsChecked: number;
  matched: number;
  eligible: number;
  sent: number;
  skipped: number;
  skipReasons: Record<string, number>;
  sampleRows: SameDayReminderJob[];
  lineSendAttempts: number;
  lineSendFailures: number;
  updatedRows: number;
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
    dryRun: boolean;
    forceSend: boolean;
    sameDayReminderEnabled: boolean;
  };
};

async function fetchSameDayReminderJobs(
  supabaseUrl: string,
  serviceRoleKey: string,
  targetDate: string,
  forceSend = false
): Promise<{ jobs: SameDayReminderJob[]; statusFieldExists: boolean }> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let withStatusQuery = supabase
    .from("outage_jobs")
    .select("id,equipment_code,outage_date,map_link,line_same_day_reminder_sent_at,status,is_closed")
    .eq("outage_date", targetDate)
    .order("outage_date", { ascending: true });

  if (!forceSend) {
    withStatusQuery = withStatusQuery.is("line_same_day_reminder_sent_at", null);
  }

  const withStatus = await withStatusQuery;

  if (!withStatus.error) {
    return {
      jobs: (withStatus.data ?? []) as SameDayReminderJob[],
      statusFieldExists: true,
    };
  }

  if (!/status|is_closed/i.test(withStatus.error.message)) {
    throw new Error(withStatus.error.message);
  }

  let withoutStatusQuery = supabase
    .from("outage_jobs")
    .select("id,equipment_code,outage_date,map_link,line_same_day_reminder_sent_at")
    .eq("outage_date", targetDate)
    .order("outage_date", { ascending: true });

  if (!forceSend) {
    withoutStatusQuery = withoutStatusQuery.is("line_same_day_reminder_sent_at", null);
  }

  const withoutStatus = await withoutStatusQuery;

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

async function runSameDayReminder(req: NextRequest, triggerSource: "cron-or-get" | "manual-post") {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const targetId = process.env.LINE_DEFAULT_TARGET_ID;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const parseFlag = (value: string | null | undefined) =>
    value === "1" || value === "true" || value === "yes";

  const queryOverride = req.nextUrl.searchParams.get("date");
  const queryDryRun = parseFlag(req.nextUrl.searchParams.get("dryRun"));
  const queryForceSend = parseFlag(req.nextUrl.searchParams.get("forceSend"));
  const parsedBody =
    triggerSource === "manual-post" ? await req.json().catch(() => ({})) : {};
  const bodyOverride =
    triggerSource === "manual-post"
      ? normalizeDateOnly(String((parsedBody as { date?: string })?.date ?? ""))
      : null;
  const bodyDryRun =
    triggerSource === "manual-post" &&
    parseFlag(String((parsedBody as { dryRun?: string | number | boolean })?.dryRun ?? ""));
  const bodyForceSend =
    triggerSource === "manual-post" &&
    parseFlag(String((parsedBody as { forceSend?: string | number | boolean })?.forceSend ?? ""));

  const dryRun = queryDryRun || bodyDryRun;
  const forceSendRequested = queryForceSend || bodyForceSend;
  const forceSend = forceSendRequested && triggerSource === "manual-post";
  const requestedDateOverride = normalizeDateOnly(queryOverride) ?? bodyOverride;

  const summary: Summary = {
    ok: true,
    mode: forceSend ? "forceSend" : dryRun ? "dryRun" : "normal",
    targetDateUsed: "",
    totalRowsChecked: 0,
    matched: 0,
    eligible: 0,
    sent: 0,
    skipped: 0,
    skipReasons: {},
    sampleRows: [],
    lineSendAttempts: 0,
    lineSendFailures: 0,
    updatedRows: 0,
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
      dryRun,
      forceSend,
      sameDayReminderEnabled: true,
    },
  };

  console.log("reminder-route-start", {
    route: "same-day-reminder",
    triggerSource,
    method: req.method,
    mode: summary.mode,
    requestedDateOverride,
    dryRun,
    forceSend,
    forceSendRequested,
  });

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

  const runtimeReadiness = getReminderRuntimeReadiness();
  const missing = getReminderMissingEnvKeys(runtimeReadiness);

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
    summary.skipReasons[reason] = (summary.skipReasons[reason] ?? 0) + 1;
  };

  try {
    const settings = await getReminderSettings();
    summary.diagnostics.sameDayReminderEnabled = settings.same_day_reminder_enabled;

    if (!settings.same_day_reminder_enabled && !forceSend) {
      console.log("reminder-route-end", {
        route: "same-day-reminder",
        reason: "same_day_reminder_disabled",
        mode: summary.mode,
      });
      return NextResponse.json({
        ...summary,
        skippedBySchedule: true,
        reason: "same_day_reminder_disabled",
      });
    }

    const targetDate = requestedDateOverride ?? computeBangkokTodayDateOnly();
    summary.targetDateUsed = targetDate;
    console.log("reminder-target-date", {
      route: "same-day-reminder",
      targetDate,
      mode: summary.mode,
    });

    const { jobs, statusFieldExists } = await fetchSameDayReminderJobs(
      lineSupabaseUrl,
      lineServiceRoleKey,
      targetDate,
      forceSend
    );

    summary.totalRowsChecked = jobs.length;
    summary.sampleRows = jobs.slice(0, 10);
    console.log("reminder-total-rows", {
      route: "same-day-reminder",
      targetDate,
      totalRows: jobs.length,
      forceSend,
    });

    const matchedJobs = jobs.filter((job) => {
      const reason = getSameDayReminderSkipReason(job, targetDate, statusFieldExists);
      return reason === null;
    });

    summary.matched = matchedJobs.length;
    let eligibleCount = 0;
    summary.eligible = matchedJobs.length;

    const supabase = createClient(lineSupabaseUrl, lineServiceRoleKey);

    for (const job of jobs) {
      const skipReason = forceSend
        ? null
        : getSameDayReminderSkipReason(job, targetDate, statusFieldExists);
      if (skipReason) {
        addSkipReason(skipReason);
        continue;
      }
      eligibleCount += 1;

      const lineText = formatSameDayReminderMessage({
        equipmentCode: job.equipment_code,
        outageDate: job.outage_date,
        mapLink: job.map_link,
      });

      if (dryRun) {
        addSkipReason("dry_run_no_send");
        continue;
      }

      summary.lineSendAttempts += 1;

      let lineResult;
      try {
        lineResult = await pushLineMessage(lineToken, lineTargetId, lineText);
      } catch (error) {
        summary.lineSendFailures += 1;
        const message = error instanceof Error ? error.message : "Unknown LINE push error";
        summary.errors.push({
          id: job.id,
          error: `LINE push threw error: ${message}`,
        });
        addSkipReason("line_push_failed");
        continue;
      }

      if (!lineResult.ok) {
        summary.lineSendFailures += 1;
        summary.errors.push({
          id: job.id,
          error: `LINE push failed (${lineResult.status}): ${lineResult.body}`,
        });
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

    summary.eligible = eligibleCount;

    console.log("reminder-sent-count", { route: "same-day-reminder", sent: summary.sent });
    console.log("reminder-skipped-count", {
      route: "same-day-reminder",
      skipped: summary.skipped,
      skipReasons: summary.skipReasons,
    });
    console.log("reminder-route-end", {
      route: "same-day-reminder",
      ok: summary.ok,
      mode: summary.mode,
      targetDate: summary.targetDateUsed,
      sent: summary.sent,
      skipped: summary.skipped,
      totalRows: summary.totalRowsChecked,
    });

    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    console.log("reminder-route-end", {
      route: "same-day-reminder",
      ok: false,
      error: message,
      mode: summary.mode,
      sent: summary.sent,
      skipped: summary.skipped,
    });

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
  return runSameDayReminder(req, "cron-or-get");
}

export async function POST(req: NextRequest) {
  return runSameDayReminder(req, "manual-post");
}
