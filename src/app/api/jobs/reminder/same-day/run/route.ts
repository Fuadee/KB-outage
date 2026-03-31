import { NextRequest, NextResponse } from "next/server";
import { normalizeDateOnly } from "@/lib/reminder";
import { runSameDayReminder } from "@/lib/sameDayReminderService";

export const runtime = "nodejs";

function parseFlag(value: string | null | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
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
  const auth = validateSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

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
