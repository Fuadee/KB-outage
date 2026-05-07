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

const MAX_PATIENTS_IN_REPLY = 5;

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
  vulnerable_check_status: string | null;
  vulnerable_check_count: number | null;
  vulnerable_patient_ids: string[] | null;
};

type BedriddenPatientRow = {
  id: string;
  patient_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  subdistrict: string | null;
  latitude: number | null;
  longitude: number | null;
  power_dependency_note: string | null;
};

function formatPatientArea(patient: BedriddenPatientRow) {
  const areaParts = [patient.address, patient.subdistrict].filter(Boolean);
  return areaParts.length > 0 ? areaParts.join(" / ") : "-";
}

function formatPatientBlock(patientCount: number, patients: BedriddenPatientRow[]) {
  const lines = [`⚠️ พบผู้ป่วยติดเตียง/กลุ่มเปราะบาง ${patientCount} ราย`];

  if (patients.length === 0) {
    lines.push("กรุณาตรวจสอบรายละเอียดในระบบ KB Outage Operations");
    return lines;
  }

  patients.slice(0, MAX_PATIENTS_IN_REPLY).forEach((patient, index) => {
    lines.push(
      `${index + 1}) ชื่อ: ${patient.patient_name ?? "-"}`,
      `   ผู้ประสาน: ${patient.contact_name ?? "-"} ${patient.contact_phone ?? ""}`.trimEnd(),
      `   พื้นที่: ${formatPatientArea(patient)}`,
      `   หมายเหตุไฟฟ้าจำเป็น: ${patient.power_dependency_note ?? "-"}`
    );

    if (patient.latitude != null && patient.longitude != null) {
      lines.push(
        `   แผนที่: https://www.google.com/maps?q=${patient.latitude},${patient.longitude}`
      );
    }

    lines.push("");
  });

  if (patientCount > MAX_PATIENTS_IN_REPLY) {
    lines.push(`และอีก ${patientCount - MAX_PATIENTS_IN_REPLY} ราย กรุณาตรวจสอบในระบบ`);
  }

  return lines;
}

function formatOutageReply(
  date: string,
  rows: OutageRow[],
  patientsByOutageKey: Map<string, BedriddenPatientRow[]>
) {
  if (rows.length === 0) {
    return "✅ วันนี้ยังไม่พบรายการดับไฟในระบบ";
  }

  const lines = ["📢 สรุปพื้นที่ดับไฟวันนี้", `📅 ${formatThaiDate(date)}`, ""];

  rows.forEach((row, index) => {
    const start = row.doc_time_start ?? "-";
    const end = row.doc_time_end ?? "-";
    const location = row.doc_area_title ?? "-";
    const mapLink = row.map_link ?? "-";
    const count = row.vulnerable_check_count ?? 0;
    const hasVulnerablePatients =
      row.vulnerable_check_status === "FOUND_IN_POLYGON" && count > 0;

    lines.push(
      `${index + 1}) เวลา ${start}-${end}`,
      `📍 ${location}`,
      `🔗 ${mapLink}`
    );

    if (hasVulnerablePatients) {
      const key = `${row.doc_time_start ?? ""}|${row.doc_time_end ?? ""}|${row.doc_area_title ?? ""}`;
      const patients = patientsByOutageKey.get(key) ?? [];
      lines.push("", ...formatPatientBlock(count, patients));
    }

    lines.push("");
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
      .select(
        "doc_time_start, doc_time_end, doc_area_title, map_link, vulnerable_check_status, vulnerable_check_count, vulnerable_patient_ids"
      )
      .eq("outage_date", bangkokToday)
      .order("doc_time_start", { ascending: true, nullsFirst: true });

    if (error) {
      throw new Error(error.message);
    }

    const outages = (data ?? []) as OutageRow[];
    console.log("outage count:", outages.length);

    const patientIdSet = new Set<string>();
    const outagePatientIds = new Map<string, string[]>();

    outages.forEach((row) => {
      const count = row.vulnerable_check_count ?? 0;
      const hasVulnerablePatients =
        row.vulnerable_check_status === "FOUND_IN_POLYGON" && count > 0;

      if (!hasVulnerablePatients) {
        return;
      }

      const key = `${row.doc_time_start ?? ""}|${row.doc_time_end ?? ""}|${row.doc_area_title ?? ""}`;
      const ids = Array.isArray(row.vulnerable_patient_ids)
        ? row.vulnerable_patient_ids.filter((id): id is string => Boolean(id))
        : [];

      outagePatientIds.set(key, ids);
      ids.forEach((id) => patientIdSet.add(id));
    });

    let patientsById = new Map<string, BedriddenPatientRow>();

    if (patientIdSet.size > 0) {
      const { data: patientData, error: patientError } = await supabase
        .from("bedridden_patients")
        .select(
          "id, patient_name, contact_name, contact_phone, address, subdistrict, latitude, longitude, power_dependency_note"
        )
        .in("id", Array.from(patientIdSet));

      if (patientError) {
        throw new Error(patientError.message);
      }

      patientsById = new Map(
        (patientData ?? []).map((patient) => [patient.id, patient as BedriddenPatientRow])
      );
    }

    const patientsByOutageKey = new Map<string, BedriddenPatientRow[]>();

    outagePatientIds.forEach((ids, key) => {
      const mapped = ids
        .map((id) => patientsById.get(id))
        .filter((patient): patient is BedriddenPatientRow => Boolean(patient));
      patientsByOutageKey.set(key, mapped);
    });

    const replyText = formatOutageReply(bangkokToday, outages, patientsByOutageKey);
    await replyLineMessage(event.replyToken, replyText);
  }

  return NextResponse.json({ ok: true });
}
