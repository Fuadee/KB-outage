import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureSystemCertificateAuthorities } from "@/lib/serverTls";
import {
  getDistributionWorkflow,
  isDirectDistributionRoute
} from "@/lib/distributionWorkflow";
import {
  findActivePersonForDepartment,
  findPersonById,
  normalizePersonId
} from "@/lib/peopleServer";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createSupabaseAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase server configuration");
  }
  ensureSystemCertificateAuthorities();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function normalizeDateTime(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id?.trim();
    const body = (await request.json()) as {
      completed_at?: unknown;
      completed_by_person_id?: unknown;
    };
    const completedAt = normalizeDateTime(body.completed_at);
    const completedByPersonId = normalizePersonId(
      body.completed_by_person_id
    );

    if (
      !jobId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        jobId
      ) ||
      !completedAt ||
      completedByPersonId === undefined
    ) {
      return NextResponse.json(
        { ok: false, error: "กรุณาระบุวันเวลาและผู้แจกจริงให้ครบถ้วน" },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();
    const { data: current, error: lookupError } = await admin
      .from("outage_jobs")
      .select(
        "id, responsible_unit, is_closed, document_delivered_at, notice_status, notice_date, notice_by_person_id, notice_by, notice_scheduled_at, notice_completed_at"
      )
      .eq("id", jobId)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!current) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบข้อมูลงานที่ต้องการ" },
        { status: 404 }
      );
    }
    if (current.is_closed) {
      return NextResponse.json(
        { ok: false, error: "งานนี้ปิดแล้ว หากต้องแก้ไขให้ย้อนขั้นตอนก่อน" },
        { status: 409 }
      );
    }
    if (!current.document_delivered_at) {
      return NextResponse.json(
        { ok: false, error: "ต้องบันทึกการส่งเอกสารก่อนยืนยันการแจกหนังสือ" },
        { status: 409 }
      );
    }
    const distributionWorkflow = getDistributionWorkflow(current);
    if (distributionWorkflow.route === "UNASSIGNED") {
      return NextResponse.json(
        { ok: false, error: "กรุณาระบุหน่วยงานผู้รับผิดชอบก่อนยืนยันการแจกหนังสือ" },
        { status: 409 }
      );
    }
    if (
      !distributionWorkflow.completed &&
      !isDirectDistributionRoute(distributionWorkflow.route) &&
      current.notice_status !== "SCHEDULED" &&
      current.notice_status !== "COMPLETED" &&
      !current.notice_date &&
      !current.notice_scheduled_at
    ) {
      return NextResponse.json(
        { ok: false, error: "กรุณาบันทึกกำหนดการแจกหนังสือก่อน" },
        { status: 409 }
      );
    }

    let distributorName: string | null = null;
    let distributorPersonId = completedByPersonId;
    const preservingExistingPerson =
      Boolean(completedByPersonId) &&
      completedByPersonId === current.notice_by_person_id;

    if (preservingExistingPerson) {
      const existingDistributor = await findPersonById(
        admin,
        completedByPersonId as string
      );
      if (
        existingDistributor?.department === distributionWorkflow.responsibleUnit
      ) {
        distributorName = existingDistributor.full_name;
      }
    } else if (completedByPersonId && distributionWorkflow.responsibleUnit) {
      const distributor = await findActivePersonForDepartment(
        admin,
        completedByPersonId,
        distributionWorkflow.responsibleUnit
      );
      if (distributor) distributorName = distributor.full_name;
    } else if (
      !completedByPersonId &&
      !current.notice_by_person_id &&
      current.notice_by &&
      distributionWorkflow.completed
    ) {
      distributorName = current.notice_by;
      distributorPersonId = null;
    }

    if (!distributorName) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "ผู้แจกจริงต้องเป็นบุคลากรที่เปิดใช้งานอยู่และสังกัดตรงกับหน่วยงานของงาน"
        },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await admin
      .from("outage_jobs")
      .update({
        notice_status: "COMPLETED",
        notice_completed_at: completedAt,
        notice_by_person_id: distributorPersonId,
        notice_by: distributorName,
        notice_completion_source: "USER"
      })
      .eq("id", jobId)
      .eq("is_closed", false)
      .select("notice_status, notice_date, notice_by_person_id, notice_by, notice_by_person:people!outage_jobs_notice_by_person_id_fkey(id, full_name, department, is_active), notice_scheduled_at, notice_completed_at, notice_completion_source")
      .single();

    if (updateError) throw updateError;
    return NextResponse.json({ ok: true, job: updated });
  } catch (error) {
    console.error("Notice completion failed", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        error: /notice_completed_at|notice_completion_source/i.test(message)
          ? "ฐานข้อมูลยังไม่ได้ติดตั้ง migration สำหรับสถานะแจกหนังสือ"
          : "บันทึกผลการแจกหนังสือไม่สำเร็จ กรุณาลองใหม่"
      },
      { status: 500 }
    );
  }
}
