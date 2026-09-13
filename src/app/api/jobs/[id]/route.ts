import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeJobId } from "@/lib/closeJob";
import { isResponsibleUnit, parseCustomerCount } from "@/lib/jobMetadata";
import {
  findActivePersonForDepartment,
  normalizePersonId
} from "@/lib/peopleServer";
import { ensureSystemCertificateAuthorities } from "@/lib/serverTls";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function createSupabaseAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase server environment variables.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function isValidDateString(value: string) {
  if (!DATE_REGEX.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  const jobId = normalizeJobId(context.params.id);
  if (!jobId) {
    return NextResponse.json(
      { ok: false, error: "รหัสงานไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    ensureSystemCertificateAuthorities();

    const body = (await request.json().catch(() => null)) as {
      outage_date?: unknown;
      equipment_code?: unknown;
      responsible_unit?: unknown;
      work_supervisor_person_id?: unknown;
      has_switching?: unknown;
      customer_count?: unknown;
      note?: unknown;
    } | null;
    const outageDate =
      typeof body?.outage_date === "string" ? body.outage_date : "";
    const equipmentCode =
      typeof body?.equipment_code === "string"
        ? body.equipment_code.trim()
        : "";
    const responsibleUnit = body?.responsible_unit;
    const requestedWorkSupervisorPersonId = normalizePersonId(
      body?.work_supervisor_person_id
    );
    const hasSwitching = body?.has_switching;
    const validResponsibleUnit =
      responsibleUnit === null || isResponsibleUnit(responsibleUnit);
    const customerCount = parseCustomerCount(body?.customer_count);

    if (!customerCount.success) {
      return NextResponse.json(
        { ok: false, error: customerCount.error },
        { status: 400 }
      );
    }

    if (
      !isValidDateString(outageDate) ||
      !equipmentCode ||
      !validResponsibleUnit ||
      requestedWorkSupervisorPersonId === undefined ||
      !(hasSwitching === null || typeof hasSwitching === "boolean") ||
      (body?.note !== undefined &&
        body.note !== null &&
        typeof body.note !== "string")
    ) {
      return NextResponse.json(
        { ok: false, error: "ข้อมูลแก้ไขงานไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const note =
      typeof body?.note === "string" ? body.note.trim() || null : null;
    const admin = createSupabaseAdminClient();
    const { data: current, error: currentError } = await admin
      .from("outage_jobs")
      .select(
        "responsible_unit, work_supervisor_person_id, work_supervisor_name, is_closed"
      )
      .eq("id", jobId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current || current.is_closed) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบงานที่แก้ไขได้" },
        { status: 404 }
      );
    }

    let workSupervisorName: string | null = null;
    if (requestedWorkSupervisorPersonId) {
      const preservingExistingSelection =
        requestedWorkSupervisorPersonId ===
          current.work_supervisor_person_id &&
        responsibleUnit === current.responsible_unit;

      if (preservingExistingSelection) {
        workSupervisorName = current.work_supervisor_name;
      } else {
        if (!isResponsibleUnit(responsibleUnit)) {
          return NextResponse.json(
            { ok: false, error: "กรุณาเลือกหน่วยงานก่อนเลือกผู้ควบคุมงาน" },
            { status: 400 }
          );
        }
        const workSupervisor = await findActivePersonForDepartment(
          admin,
          requestedWorkSupervisorPersonId,
          responsibleUnit
        );
        if (!workSupervisor) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "ผู้ควบคุมงานต้องเป็นบุคลากรที่ใช้งานอยู่และสังกัดตรงกับหน่วยงาน"
            },
            { status: 400 }
          );
        }
        workSupervisorName = workSupervisor.full_name;
      }
    } else if (
      current.work_supervisor_person_id === null &&
      responsibleUnit === current.responsible_unit
    ) {
      workSupervisorName = current.work_supervisor_name;
    }

    if (
      isResponsibleUnit(responsibleUnit) &&
      !requestedWorkSupervisorPersonId &&
      !workSupervisorName
    ) {
      return NextResponse.json(
        { ok: false, error: "กรุณาเลือกผู้ควบคุมงานจากรายชื่อบุคลากร" },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from("outage_jobs")
      .update({
        outage_date: outageDate,
        equipment_code: equipmentCode,
        responsible_unit: responsibleUnit,
        work_supervisor_person_id: requestedWorkSupervisorPersonId,
        work_supervisor_name: workSupervisorName,
        has_switching: hasSwitching,
        customer_count: customerCount.value,
        note
      })
      .eq("id", jobId)
      .eq("is_closed", false)
      .select(
        "id, outage_date, equipment_code, responsible_unit, work_supervisor_person_id, work_supervisor_name, has_switching, customer_count, note"
      )
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบงานที่แก้ไขได้" },
        { status: 404 }
      );
    }
    if (data.responsible_unit !== responsibleUnit) {
      throw new Error("Responsible unit was not persisted by the database.");
    }
    if (
      data.work_supervisor_person_id !== requestedWorkSupervisorPersonId
    ) {
      throw new Error("Work supervisor was not persisted by the database.");
    }
    if (data.customer_count !== customerCount.value) {
      throw new Error("Customer count was not persisted by the database.");
    }
    if (data.has_switching !== hasSwitching) {
      throw new Error("Switching value was not persisted by the database.");
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("Update job failed", error);
    return NextResponse.json(
      { ok: false, error: "แก้ไขงานไม่สำเร็จ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
