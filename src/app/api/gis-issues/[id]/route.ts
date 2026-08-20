import { NextResponse } from "next/server";
import {
  canTransitionGisIssue,
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

const respondError = (error: unknown, fallback: string) => {
  logGisError("[gis-issues][id]", error);
  return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
};

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { admin } = await getGisContext();
    const [{ data: issue, error }, { data: activities, error: activityError }] =
      await Promise.all([
        admin.from("gis_issues").select(issueSelect).eq("id", params.id).single(),
        admin
          .from("gis_issue_activities")
          .select("id, issue_id, activity_type, from_status, to_status, message, actor_name, created_at")
          .eq("issue_id", params.id)
          .order("created_at", { ascending: false })
      ]);

    if (error || !issue) {
      return NextResponse.json({ ok: false, error: "ไม่พบ GIS Issue" }, { status: 404 });
    }
    if (activityError) throw activityError;
    return NextResponse.json({ ok: true, data: issue, activities: activities ?? [] });
  } catch (error) {
    return respondError(error, "ไม่สามารถโหลดรายละเอียด GIS Issue ได้");
  }
}

type PatchPayload = {
  status?: unknown;
  feeder_code?: unknown;
  equipment_code?: unknown;
  issue_type?: unknown;
  issue_type_detail?: unknown;
  location_text?: unknown;
  description?: unknown;
  expected_value?: unknown;
  assignee_name?: unknown;
  found_at?: unknown;
  resolution_note?: unknown;
  reference_url?: unknown;
};

const statusMessage: Record<GisIssueStatus, string> = {
  OPEN: "เปิด Issue กลับมาใหม่",
  IN_PROGRESS: "เริ่มดำเนินการแก้ไข",
  VERIFYING: "แก้ไข GIS แล้ว ส่งตรวจสอบ",
  CLOSED: "ตรวจสอบแล้ว ปิด Issue"
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { admin, actorName } = await getGisContext();
    const body = (await request.json()) as PatchPayload;
    const { data: current, error: currentError } = await admin
      .from("gis_issues")
      .select("*")
      .eq("id", params.id)
      .single();
    if (currentError || !current) {
      return NextResponse.json({ ok: false, error: "ไม่พบ GIS Issue" }, { status: 404 });
    }

    const patch: Record<string, unknown> = {};
    let activityType: "UPDATED" | "STATUS_CHANGED" = "UPDATED";
    let activityMessage = "แก้ไขรายละเอียด Issue";
    let fromStatus: GisIssueStatus | null = null;
    let toStatus: GisIssueStatus | null = null;

    if (body.status !== undefined) {
      if (!isGisIssueStatus(body.status)) {
        return NextResponse.json({ ok: false, error: "สถานะไม่ถูกต้อง" }, { status: 400 });
      }
      const currentStatus = current.status as GisIssueStatus;
      if (!canTransitionGisIssue(currentStatus, body.status)) {
        return NextResponse.json(
          { ok: false, error: "ไม่สามารถเปลี่ยนสถานะข้ามขั้นตอนได้" },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      patch.status = body.status;
      if (body.status === "IN_PROGRESS") {
        patch.started_at = now;
        const assignee = normalizeOptionalText(body.assignee_name);
        if (assignee) patch.assignee_name = assignee;
      } else if (body.status === "VERIFYING") {
        const resolutionNote = normalizeOptionalText(body.resolution_note);
        if (!resolutionNote) {
          return NextResponse.json(
            { ok: false, error: "กรุณาระบุรายละเอียดการแก้ไขก่อนส่งตรวจสอบ" },
            { status: 400 }
          );
        }
        patch.resolution_note = resolutionNote;
        patch.resolved_at = now;
      } else if (body.status === "CLOSED") {
        patch.verified_at = now;
      } else {
        patch.started_at = null;
        patch.resolved_at = null;
        patch.verified_at = null;
        patch.resolution_note = null;
      }
      activityType = "STATUS_CHANGED";
      activityMessage = statusMessage[body.status];
      fromStatus = currentStatus;
      toStatus = body.status;
    } else {
      if (body.feeder_code !== undefined) {
        const value = normalizeOptionalText(body.feeder_code);
        if (!value) return NextResponse.json({ ok: false, error: "กรุณาระบุ Feeder" }, { status: 400 });
        patch.feeder_code = value.toUpperCase();
      }
      if (body.equipment_code !== undefined) patch.equipment_code = normalizeOptionalText(body.equipment_code)?.toUpperCase() ?? null;
      if (body.issue_type !== undefined) {
        if (!isGisIssueType(body.issue_type)) return NextResponse.json({ ok: false, error: "ประเภทปัญหาไม่ถูกต้อง" }, { status: 400 });
        patch.issue_type = body.issue_type;
      }
      if (body.issue_type_detail !== undefined) patch.issue_type_detail = normalizeOptionalText(body.issue_type_detail);
      if (body.location_text !== undefined) patch.location_text = normalizeOptionalText(body.location_text);
      if (body.description !== undefined) {
        const value = normalizeOptionalText(body.description);
        if (!value) return NextResponse.json({ ok: false, error: "กรุณาระบุรายละเอียดสิ่งที่ผิด" }, { status: 400 });
        patch.description = value;
      }
      if (body.expected_value !== undefined) patch.expected_value = normalizeOptionalText(body.expected_value);
      if (body.assignee_name !== undefined) patch.assignee_name = normalizeOptionalText(body.assignee_name);
      if (body.resolution_note !== undefined) patch.resolution_note = normalizeOptionalText(body.resolution_note);
      if (body.found_at !== undefined) {
        const value = normalizeOptionalText(body.found_at);
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NextResponse.json({ ok: false, error: "วันที่พบไม่ถูกต้อง" }, { status: 400 });
        patch.found_at = value;
      }
      if (body.reference_url !== undefined) {
        const value = normalizeOptionalText(body.reference_url);
        if (!isValidOptionalUrl(value)) return NextResponse.json({ ok: false, error: "URL อ้างอิงไม่ถูกต้อง" }, { status: 400 });
        patch.reference_url = value;
      }
      const nextType = (patch.issue_type ?? current.issue_type) as string;
      const nextTypeDetail = (patch.issue_type_detail ?? current.issue_type_detail) as string | null;
      if (nextType === "OTHER" && !normalizeOptionalText(nextTypeDetail)) {
        return NextResponse.json({ ok: false, error: "กรุณาระบุประเภทปัญหาอื่น ๆ" }, { status: 400 });
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "ไม่มีข้อมูลที่ต้องอัปเดต" }, { status: 400 });
    }

    const { data: issue, error } = await admin
      .from("gis_issues")
      .update(patch)
      .eq("id", params.id)
      .select(issueSelect)
      .single();
    if (error || !issue) throw error ?? new Error("Update GIS issue failed");

    const { error: activityError } = await admin.from("gis_issue_activities").insert({
      issue_id: params.id,
      activity_type: activityType,
      from_status: fromStatus,
      to_status: toStatus,
      message: activityMessage,
      actor_name: actorName
    });
    if (activityError) logGisError("[gis-issues][activity]", activityError);

    return NextResponse.json({ ok: true, data: issue });
  } catch (error) {
    return respondError(error, "ไม่สามารถอัปเดต GIS Issue ได้ กรุณาลองใหม่");
  }
}
