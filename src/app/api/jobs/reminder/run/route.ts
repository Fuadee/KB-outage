import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ReminderJob = {
  id: number | string;
  equipment_code: string | null;
  outage_date: string | null;
  line_reminder_sent_at: string | null;
  status?: string | null;
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
};

const THAI_SHORT_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function formatThaiDateBE(dateText: string | null | undefined): string {
  if (!dateText) return "-";

  const [y, m, d] = dateText.split("-").map(Number);
  if (!y || !m || !d) return dateText;

  const month = THAI_SHORT_MONTHS[m - 1] ?? "";
  const buddhistYear = y + 543;
  return `${d} ${month} ${buddhistYear}`;
}

function getTargetDateInBangkok(daysFromToday: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");

  const bangkokMidnightUtc = new Date(Date.UTC(year, month - 1, day));
  bangkokMidnightUtc.setUTCDate(bangkokMidnightUtc.getUTCDate() + daysFromToday);

  const yyyy = bangkokMidnightUtc.getUTCFullYear();
  const mm = String(bangkokMidnightUtc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(bangkokMidnightUtc.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnly = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return dateOnly;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchReminderJobs(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ jobs: ReminderJob[]; statusFieldExists: boolean }> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const withStatus = await supabase
    .from("outage_jobs")
    .select("id,equipment_code,outage_date,line_reminder_sent_at,status")
    .order("outage_date", { ascending: true })
    .limit(20);

  if (!withStatus.error) {
    return {
      jobs: (withStatus.data ?? []) as ReminderJob[],
      statusFieldExists: true,
    };
  }

  if (!/status/i.test(withStatus.error.message)) {
    throw new Error(withStatus.error.message);
  }

  const withoutStatus = await supabase
    .from("outage_jobs")
    .select("id,equipment_code,outage_date,line_reminder_sent_at")
    .order("outage_date", { ascending: true })
    .limit(20);

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

export async function POST() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const targetId = process.env.LINE_DEFAULT_TARGET_ID;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [
    !token && "LINE_CHANNEL_ACCESS_TOKEN",
    !targetId && "LINE_DEFAULT_TARGET_ID",
    !supabaseUrl && "SUPABASE_URL",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing required env variables",
        missing,
      },
      { status: 500 }
    );
  }

  const summary: Summary = {
    ok: true,
    targetDateUsed: "",
    totalRowsChecked: 0,
    matched: 0,
    sent: 0,
    skipped: 0,
    sampleRows: [],
    errors: [],
  };

  try {
    const targetDate = getTargetDateInBangkok(5);
    summary.targetDateUsed = targetDate;
    const { jobs, statusFieldExists } = await fetchReminderJobs(
      supabaseUrl!,
      serviceRoleKey!
    );

    summary.totalRowsChecked = jobs.length;
    summary.sampleRows = jobs.slice(0, 10);

    const matchedJobs = jobs.filter((job) => {
      if (job.line_reminder_sent_at) {
        return false;
      }

      const normalizedOutageDate = normalizeDateOnly(job.outage_date);
      return normalizedOutageDate === targetDate;
    });

    summary.matched = matchedJobs.length;

    const supabase = createClient(supabaseUrl!, serviceRoleKey!);

    for (const job of matchedJobs) {
      const normalizedStatus = (job.status ?? "").toLowerCase().trim();
      if (
        statusFieldExists &&
        (normalizedStatus === "closed" || normalizedStatus === "done")
      ) {
        summary.skipped += 1;
        continue;
      }

      const lineText = `⚡ แจ้งเตือนเตรียมขอดับไฟ\n\nงาน: ${job.equipment_code ?? "-"}\nวันที่ดับไฟ: ${formatThaiDateBE(job.outage_date)}\n\n⏰ เหลือเวลา 5 วัน\nกรุณาดำเนินการขออนุมัติดับไฟ\nเพื่อเตรียมแจ้งผู้ใช้ไฟฟ้า`;

      const lineResult = await pushLineMessage(token!, targetId!, lineText);

      if (!lineResult.ok) {
        summary.errors.push({
          id: job.id,
          error: `LINE push failed (${lineResult.status}): ${lineResult.body}`,
        });
        continue;
      }

      const { error: updateError } = await supabase
        .from("outage_jobs")
        .update({ line_reminder_sent_at: new Date().toISOString() })
        .eq("id", job.id);

      if (updateError) {
        summary.errors.push({
          id: job.id,
          error: `Failed to update line_reminder_sent_at: ${updateError.message}`,
        });
        continue;
      }

      summary.sent += 1;
    }

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
