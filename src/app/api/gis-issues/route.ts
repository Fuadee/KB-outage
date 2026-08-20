import { NextResponse } from "next/server";
import {
  GIS_ISSUE_STATUSES,
  isGisIssueStatus,
  isGisIssueType,
  type GisIssueStatus
} from "@/lib/gisIssues";
import {
  getGisContext,
  isValidOptionalUrl,
  logGisError,
  normalizeOptionalText
} from "@/lib/gisIssuesServer";

export const runtime = "nodejs";

const issueSelect = `
  id, issue_number, feeder_code, equipment_code, issue_type, issue_type_detail,
  location_text, description, expected_value, status, reporter_id, reporter_name,
  assignee_name, found_at, started_at, resolved_at, verified_at, resolution_note,
  reference_url, source_job_id, created_at, updated_at,
  source_job:outage_jobs!source_job_id(id, equipment_code, outage_date, doc_area_title)
`;

const errorResponse = (error: unknown, fallback: string) => {
  logGisError("[gis-issues]", error);
  return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
};

const escapeSearch = (value: string) => value.replace(/[%_,().]/g, "\\$&");

export async function GET(request: Request) {
  try {
    const { admin } = await getGisContext();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const status = searchParams.get("status");
    const feeder = searchParams.get("feeder")?.trim() ?? "";
    const issueType = searchParams.get("issue_type");
    const sourceJobId = searchParams.get("source_job_id")?.trim() ?? "";

    let query = admin
      .from("gis_issues")
      .select(issueSelect)
      .order("updated_at", { ascending: false });

    if (status && status !== "ALL" && isGisIssueStatus(status)) {
      query = query.eq("status", status);
    }
    if (feeder) query = query.eq("feeder_code", feeder);
    if (issueType && issueType !== "ALL" && isGisIssueType(issueType)) {
      query = query.eq("issue_type", issueType);
    }
    if (sourceJobId) query = query.eq("source_job_id", sourceJobId);
    if (q) {
      const keyword = `%${escapeSearch(q)}%`;
      query = query.or(
        [
          `issue_number.ilike.${keyword}`,
          `feeder_code.ilike.${keyword}`,
          `equipment_code.ilike.${keyword}`,
          `location_text.ilike.${keyword}`,
          `description.ilike.${keyword}`,
          `expected_value.ilike.${keyword}`,
          `assignee_name.ilike.${keyword}`
        ].join(",")
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    const counts = Object.fromEntries(
      GIS_ISSUE_STATUSES.map((item) => [item, 0])
    ) as Record<GisIssueStatus, number>;
    const { data: countRows, error: countError } = await admin
      .from("gis_issues")
      .select("status, feeder_code");
    if (countError) throw countError;
    for (const row of countRows ?? []) {
      if (isGisIssueStatus(row.status)) counts[row.status] += 1;
    }

    const feeders = [...new Set((countRows ?? []).map((row) => row.feeder_code).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ ok: true, data: data ?? [], counts, feeders });
  } catch (error) {
    return errorResponse(error, "ไม่สามารถโหลด GIS Issues ได้ กรุณาลองใหม่");
  }
}

type CreatePayload = {
  feeder_code?: unknown;
  equipment_code?: unknown;
  issue_type?: unknown;
  issue_type_detail?: unknown;
  location_text?: unknown;
  description?: unknown;
  expected_value?: unknown;
  assignee_name?: unknown;
  found_at?: unknown;
  reference_url?: unknown;
  source_job_id?: unknown;
};

export async function POST(request: Request) {
  try {
    const { admin, actorName } = await getGisContext();
    const body = (await request.json()) as CreatePayload;
    const feederCode = normalizeOptionalText(body.feeder_code);
    const description = normalizeOptionalText(body.description);
    const referenceUrl = normalizeOptionalText(body.reference_url);

    if (!feederCode) {
      return NextResponse.json({ ok: false, error: "กรุณาระบุ Feeder" }, { status: 400 });
    }
    if (!isGisIssueType(body.issue_type)) {
      return NextResponse.json({ ok: false, error: "กรุณาเลือกประเภทปัญหา" }, { status: 400 });
    }
    const issueTypeDetail = normalizeOptionalText(body.issue_type_detail);
    if (body.issue_type === "OTHER" && !issueTypeDetail) {
      return NextResponse.json({ ok: false, error: "กรุณาระบุประเภทปัญหาอื่น ๆ" }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ ok: false, error: "กรุณาระบุรายละเอียดสิ่งที่ผิด" }, { status: 400 });
    }
    if (!isValidOptionalUrl(referenceUrl)) {
      return NextResponse.json({ ok: false, error: "URL อ้างอิงไม่ถูกต้อง" }, { status: 400 });
    }

    const foundAt = normalizeOptionalText(body.found_at);
    if (foundAt && !/^\d{4}-\d{2}-\d{2}$/.test(foundAt)) {
      return NextResponse.json({ ok: false, error: "วันที่พบไม่ถูกต้อง" }, { status: 400 });
    }

    const payload = {
      feeder_code: feederCode.toUpperCase(),
      equipment_code: normalizeOptionalText(body.equipment_code)?.toUpperCase() ?? null,
      issue_type: body.issue_type,
      issue_type_detail: issueTypeDetail,
      location_text: normalizeOptionalText(body.location_text),
      description,
      expected_value: normalizeOptionalText(body.expected_value),
      reporter_name: actorName,
      assignee_name: normalizeOptionalText(body.assignee_name),
      ...(foundAt ? { found_at: foundAt } : {}),
      reference_url: referenceUrl,
      source_job_id: normalizeOptionalText(body.source_job_id)
    };

    const { data: issue, error } = await admin
      .from("gis_issues")
      .insert(payload)
      .select(issueSelect)
      .single();
    if (error || !issue) throw error ?? new Error("Create GIS issue failed");

    const { error: activityError } = await admin.from("gis_issue_activities").insert({
      issue_id: issue.id,
      activity_type: "CREATED",
      from_status: null,
      to_status: "OPEN",
      message: "สร้าง Issue",
      actor_name: actorName
    });
    if (activityError) logGisError("[gis-issues][activity]", activityError);

    return NextResponse.json({ ok: true, data: issue }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "ไม่สามารถสร้าง GIS Issue ได้ กรุณาลองใหม่");
  }
}
