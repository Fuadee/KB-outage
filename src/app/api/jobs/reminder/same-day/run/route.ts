import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  BANGKOK_TIMEZONE,
  computeBangkokTodayDateOnly,
  formatSameDayReminderMessage,
  getSameDayReminderSkipReason,
  normalizeDateOnly,
} from "@/lib/reminder";

export const runtime = "nodejs";

type SameDayReminderJob = {
  id: number | string;
  equipment_code: string | null;
  outage_date: string | null;
  line_same_day_reminder_sent_at: string | null;
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
  sampleRows: SameDayReminderJob[];
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
  };
};

async function fetchSameDayReminderJobs(
  supabaseUrl: string,
  serviceRoleKey: string,
  targetDate: string
): Promise<{ jobs: SameDayReminderJob[]; statusFieldExists: boolean }> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const withStatus = await supabase
    .from("outage_jobs")
    .select("id,equipment_code,outage_date,line_same_day_reminder_sent_at,status,is_closed")
    .eq("outage_date", targetDate)
    .is("line_same_day_reminder_sent_at", null)
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
    .select("id,equipment_code,outage_date,line_same_day_reminder_sent_at")
    .eq("outage_date", targetDate)
    .is("line_same_day_reminder_sent_at", null)
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

async function runSameDayReminder(req: NextRequest, triggerSource: "cron-or-get" | "manual-post") {
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
    const targetDate = requestedDateOverride ?? computeBangkokTodayDateOnly();
    summary.targetDateUsed = targetDate;

    const { jobs, statusFieldExists } = await fetchSameDayReminderJobs(
      lineSupabaseUrl,
      lineServiceRoleKey,
      targetDate
    );

    summary.totalRowsChecked = jobs.length;
    summary.sampleRows = jobs.slice(0, 10);

    const matchedJobs = jobs.filter((job) => {
      const reason = getSameDayReminderSkipReason(job, targetDate, statusFieldExists);
      return reason === null;
    });

    summary.matched = matchedJobs.length;

    const supabase = createClient(lineSupabaseUrl, lineServiceRoleKey);

    for (const job of jobs) {
      const skipReason = getSameDayReminderSkipReason(job, targetDate, statusFieldExists);
      if (skipReason) {
        addSkipReason(skipReason);
        continue;
      }

      const lineText = formatSameDayReminderMessage({
        equipmentCode: job.equipment_code,
        outageDate: job.outage_date,
      });

      const lineResult = await pushLineMessage(lineToken, lineTargetId, lineText);
      console.log("[reminder-same-day] LINE push", {
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

      summary.sent += 1;
    }

    console.log("[reminder-same-day] summary", summary);
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
  return runSameDayReminder(req, "cron-or-get");
}

export async function POST(req: NextRequest) {
  return runSameDayReminder(req, "manual-post");
}
