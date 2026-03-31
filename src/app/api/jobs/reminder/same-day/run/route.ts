import { NextRequest, NextResponse } from "next/server";
import { computeBangkokTodayDateOnly, normalizeDateOnly } from "@/lib/reminder";
import { runSameDayReminder, type SameDayReminderRunSummary } from "@/lib/sameDayReminderService";

export const runtime = "nodejs";

function parseFlag(value: string | null | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function buildFailedSummary(trigger: "external-get" | "external-post", error: string): SameDayReminderRunSummary {
  const now = new Date();
  return {
    ok: false,
    nowUtc: now.toISOString(),
    nowBangkok: new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Bangkok",
      hourCycle: "h23",
      dateStyle: "short",
      timeStyle: "medium",
    }).format(now),
    targetDateUsed: computeBangkokTodayDateOnly(now),
    dryRun: false,
    totalRowsChecked: 0,
    matched: 0,
    sent: 0,
    skipped: 0,
    skipReasons: {},
    sampleRows: [],
    lineSendAttempts: 0,
    lineSendFailures: 0,
    updatedRows: 0,
    trigger,
    errors: [{ error }],
  };
}

function validateSecret(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expectedSecret = process.env.REMINDER_JOB_SECRET;
  if (!expectedSecret) {
    return { ok: false, status: 500, error: "REMINDER_JOB_SECRET is not configured" };
  }

  const receivedSecret = req.headers.get("x-reminder-secret");
  if (!receivedSecret) {
    return { ok: false, status: 401, error: "Missing x-reminder-secret" };
  }

  if (receivedSecret !== expectedSecret) {
    return { ok: false, status: 403, error: "Invalid x-reminder-secret" };
  }

  return { ok: true };
}

async function handleRun(req: NextRequest, trigger: "external-get" | "external-post") {
  const requestedAt = new Date().toISOString();
  console.log("same-day-reminder-request-received", {
    requestedAt,
    method: req.method,
    trigger,
    path: req.nextUrl.pathname,
    hasDateParam: Boolean(req.nextUrl.searchParams.get("date")),
    hasDryRunParam: Boolean(req.nextUrl.searchParams.get("dryRun")),
  });

  const auth = validateSecret(req);
  if (!auth.ok) {
    const failedSummary = buildFailedSummary(trigger, auth.error);
    console.warn("same-day-reminder-auth-failed", {
      requestedAt,
      trigger,
      status: auth.status,
      error: auth.error,
    });
    return NextResponse.json(failedSummary, { status: auth.status });
  }

  console.log("same-day-reminder-auth-passed", { requestedAt, trigger });

  const queryDate = normalizeDateOnly(req.nextUrl.searchParams.get("date"));
  const queryDryRun = parseFlag(req.nextUrl.searchParams.get("dryRun"));

  let bodyDate: string | null = null;
  let bodyDryRun = false;

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    bodyDate = normalizeDateOnly(String((body as { date?: string })?.date ?? ""));
    bodyDryRun = parseFlag(String((body as { dryRun?: string | number | boolean })?.dryRun ?? ""));
  }

  const run = await runSameDayReminder({
    date: queryDate ?? bodyDate,
    dryRun: queryDryRun || bodyDryRun,
    trigger,
  });

  return NextResponse.json(run.summary, { status: run.status });
}

export async function GET(req: NextRequest) {
  return handleRun(req, "external-get");
}

export async function POST(req: NextRequest) {
  return handleRun(req, "external-post");
}
