import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

const CHECK_TODAY_COMMANDS = new Set([
  "ตรวจสอบพื้นที่ดับไฟวันนี้",
  "ตรวจสอบการขอดับไฟวันนี้"
]);

function createSupabaseServerClient() {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function getBangkokDateString() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}

function formatThaiDate(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00+07:00`);
  return date.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

type OutageRow = {
  doc_time_start: string | null;
  doc_time_end: string | null;
  doc_area_title: string | null;
  map_link: string | null;
};

function formatOutageReply(date: string, rows: OutageRow[]) {
  if (rows.length === 0) {
    return "✅ วันนี้ยังไม่พบรายการดับไฟในระบบ";
  }

  const lines = ["📢 สรุปพื้นที่ดับไฟวันนี้", `📅 ${formatThaiDate(date)}`, ""];

  rows.forEach((row, index) => {
    const start = row.doc_time_start ?? "-";
    const end = row.doc_time_end ?? "-";
    const location = row.doc_area_title ?? "-";
    const mapLink = row.map_link ?? "-";

    lines.push(
      `${index + 1}) เวลา ${start}-${end}`,
      `📍 ${location}`,
      `🔗 ${mapLink}`,
      ""
    );
  });

  return lines.join("\n").trim();
}

async function replyLineMessage(replyToken: string, text: string) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN env var.");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE reply failed (${response.status}): ${errorText}`);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  console.log("LINE WEBHOOK EVENT:");
  console.log(JSON.stringify(body, null, 2));

  const events = Array.isArray(body?.events) ? body.events : [];

  for (const event of events) {
    if (event?.type !== "message" || event?.message?.type !== "text") {
      continue;
    }

    const receivedText = String(event.message.text ?? "").trim();
    console.log("received text:", receivedText);

    if (!CHECK_TODAY_COMMANDS.has(receivedText)) {
      continue;
    }

    console.log("matched command:", receivedText);

    const bangkokToday = getBangkokDateString();
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("outage_jobs")
      .select("doc_time_start, doc_time_end, doc_area_title, map_link")
      .eq("outage_date", bangkokToday)
      .order("doc_time_start", { ascending: true, nullsFirst: true });

    if (error) {
      throw new Error(error.message);
    }

    const outages = (data ?? []) as OutageRow[];
    console.log("outage count:", outages.length);

    const replyText = formatOutageReply(bangkokToday, outages);
    await replyLineMessage(event.replyToken, replyText);
  }

  return NextResponse.json({ ok: true });
}
