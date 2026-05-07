import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import {
  generateOutageDocxBuffer,
  OUTAGE_TEMPLATE_PATH
} from "@/lib/docs/outage-docx-template";
import { extractGoogleMyMapsMid } from "@/lib/googleMyMaps";

export const runtime = "nodejs";

type DocPayload = {
  doc_issue_date: string;
  doc_purpose: string;
  doc_area_title: string;
  doc_time_start: string;
  doc_time_end: string;
  doc_area_detail: string;
  map_link: string;
};

type CreateDocRequest = {
  jobId: string;
  payload: DocPayload;
};

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createSupabaseServerClient() {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function isPayloadValid(payload: Partial<DocPayload>) {
  return (
    Boolean(payload.doc_issue_date) &&
    Boolean(payload.doc_purpose?.trim()) &&
    Boolean(payload.doc_area_title?.trim()) &&
    Boolean(payload.doc_time_start?.trim()) &&
    Boolean(payload.doc_time_end?.trim()) &&
    Boolean(payload.doc_area_detail?.trim()) &&
    Boolean(payload.map_link?.trim())
  );
}

function toAsciiFilename(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "_");
}

function buildContentDisposition(asciiName: string, utf8Name?: string) {
  if (!utf8Name) return `attachment; filename="${asciiName}"`;
  const encoded = encodeURIComponent(utf8Name)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}

type LatLng = { lat: number; lng: number };

function parseKmlPolygons(kmlText: string): LatLng[][] {
  const polygons: LatLng[][] = [];
  const polygonBlocks = kmlText.match(/<Polygon[\s\S]*?<\/Polygon>/gi) ?? [];

  for (const polygonBlock of polygonBlocks) {
    const coordinatesBlocks =
      polygonBlock.match(/<coordinates>([\s\S]*?)<\/coordinates>/gi) ?? [];
    for (const block of coordinatesBlocks) {
      const raw = block.replace(/<\/?coordinates>/gi, "").trim();
      if (!raw) continue;
      const points = raw
        .split(/\s+/)
        .map((coord) => coord.trim())
        .filter(Boolean)
        .map((coord) => {
          const [lngRaw, latRaw] = coord.split(",");
          const lat = Number.parseFloat(latRaw);
          const lng = Number.parseFloat(lngRaw);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return { lat, lng };
        })
        .filter((point): point is LatLng => Boolean(point));

      if (points.length >= 3) polygons.push(points);
    }
  }

  return polygons;
}

function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

async function runVulnerableCheck(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  jobId: string | number,
  mapLink: string
) {
  const mid = extractGoogleMyMapsMid(mapLink);
  if (!mid) {
    await supabase
      .from("outage_jobs")
      .update({
        vulnerable_check_status: "NO_POLYGON_FOUND",
        vulnerable_check_error: "ไม่พบ Polygon ใน Google My Maps",
        vulnerable_check_checked_at: new Date().toISOString()
      })
      .eq("id", jobId);
    return;
  }

  try {
    const kmlUrl = `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}`;
    const response = await fetch(kmlUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`KML fetch failed with status ${response.status}`);
    }
    const kmlText = await response.text();
    const polygons = parseKmlPolygons(kmlText);
    if (polygons.length === 0) {
      await supabase
        .from("outage_jobs")
        .update({
          vulnerable_check_status: "NO_POLYGON_FOUND",
          vulnerable_check_error: "ไม่พบ Polygon ใน Google My Maps",
          vulnerable_check_checked_at: new Date().toISOString()
        })
        .eq("id", jobId);
      return;
    }

    const { data: patients, error: patientError } = await supabase
      .from("bedridden_patients")
      .select("id, latitude, longitude")
      .eq("status", "ACTIVE")
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (patientError) {
      throw new Error(patientError.message);
    }

    const patientIds = (patients ?? [])
      .filter((patient) =>
        polygons.some((polygon) =>
          isPointInPolygon(
            { lat: Number(patient.latitude), lng: Number(patient.longitude) },
            polygon
          )
        )
      )
      .map((patient) => patient.id);

    await supabase
      .from("outage_jobs")
      .update({
        vulnerable_check_status:
          patientIds.length > 0 ? "FOUND_IN_POLYGON" : "NOT_FOUND_IN_POLYGON",
        vulnerable_check_count: patientIds.length,
        vulnerable_patient_ids: patientIds,
        vulnerable_check_checked_at: new Date().toISOString(),
        vulnerable_check_error: null
      })
      .eq("id", jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await supabase
      .from("outage_jobs")
      .update({
        vulnerable_check_status: "KML_FETCH_FAILED",
        vulnerable_check_error: message,
        vulnerable_check_checked_at: new Date().toISOString()
      })
      .eq("id", jobId);
  }
}

export async function POST(request: Request) {
  let jobId: string | number | undefined;
  try {
    const body = (await request.json()) as Partial<CreateDocRequest> & {
      id?: string | number;
      payload?: Partial<DocPayload> & { jobId?: string | number };
    };
    console.info("Docs create request body:", JSON.stringify(body, null, 2));
    jobId = body?.jobId ?? body?.payload?.jobId ?? body?.id;
    console.info("Docs create jobId:", jobId);

    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "missing jobId" },
        { status: 400 }
      );
    }

    if (!body?.payload || !isPayloadValid(body.payload)) {
      return NextResponse.json(
        { ok: false, error: "กรุณากรอกข้อมูลให้ครบถ้วน" },
        { status: 400 }
      );
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY env var." },
        { status: 500 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data: job, error: jobError } = await supabase
      .from("outage_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    console.log("Docs create jobError:", jobError);
    console.log("Docs create job:", job);

    if (jobError || !job) {
      return NextResponse.json(
        {
          ok: false,
          error: "ไม่พบข้อมูลงานที่ต้องการ",
          debug: { jobId, jobError }
        },
        { status: 404 }
      );
    }

    const payload = body.payload as DocPayload;
    const { error: updateError } = await supabase
      .from("outage_jobs")
      .update({
        doc_issue_date: payload.doc_issue_date,
        doc_purpose: payload.doc_purpose,
        doc_area_title: payload.doc_area_title,
        doc_time_start: payload.doc_time_start,
        doc_time_end: payload.doc_time_end,
        doc_area_detail: payload.doc_area_detail,
        map_link: payload.map_link,
        doc_status: "GENERATING",
        doc_url: null,
        doc_generated_at: null
      })
      .eq("id", jobId);

    if (updateError) {
      throw new Error(updateError.message);
    }
    await runVulnerableCheck(supabase, jobId, payload.map_link);

    console.info("DOCX template path:", OUTAGE_TEMPLATE_PATH);
    console.info("DOCX template jobId:", jobId);
    console.info("DOCX generation mode: template");
    try {
      await fs.access(OUTAGE_TEMPLATE_PATH);
    } catch {
      const missingMessage =
        "Missing DOCX template at templates/outage_template.docx. See README: DOCX Template Setup.";
      console.error(missingMessage);
      await supabase
        .from("outage_jobs")
        .update({
          doc_status: "ERROR"
        })
        .eq("id", jobId);
      return NextResponse.json(
        {
          ok: false,
          error: missingMessage
        },
        { status: 500 }
      );
    }

    const buffer = await generateOutageDocxBuffer({ payload, job });
    const bytes = new Uint8Array(buffer);

    const { error: finalizeError } = await supabase
      .from("outage_jobs")
      .update({
        doc_status: "GENERATED",
        doc_url: null,
        doc_generated_at: new Date().toISOString()
      })
      .eq("id", jobId);

    if (finalizeError) {
      throw new Error(finalizeError.message);
    }

    const asciiName = toAsciiFilename(
      `outage-doc-${job.equipment_code ?? "JOB"}-${job.outage_date ?? ""}.docx`
    );
    const thaiName = `เอกสารดับไฟ-${job.equipment_code ?? "JOB"}-${
      job.outage_date ?? ""
    }.docx`;
    const contentDisposition = buildContentDisposition(asciiName, thaiName);

    if (process.env.NODE_ENV !== "production") {
      const hasOnlyAsciiOrPercentEncoding = /^[\x20-\x7E]+$/.test(
        contentDisposition
      );
      console.info("Docs create Content-Disposition:", contentDisposition, {
        hasOnlyAsciiOrPercentEncoding
      });
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDisposition,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Doc generation failed", error);
    if (jobId) {
      try {
        const supabase = createSupabaseServerClient();
        await supabase
          .from("outage_jobs")
          .update({
            doc_status: "ERROR"
          })
          .eq("id", jobId);
      } catch (updateError) {
        console.error("Failed to update doc_status to ERROR", updateError);
      }
    }
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถสร้างเอกสารได้ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
