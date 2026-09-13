import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isResponsibleUnit } from "@/lib/jobMetadata";
import { PERSON_ID_PATTERN } from "@/lib/peopleServer";
import { ensureSystemCertificateAuthorities } from "@/lib/serverTls";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getServerSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase server configuration");
  }
  ensureSystemCertificateAuthorities();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (!PERSON_ID_PATTERN.test(params.id)) {
      return NextResponse.json(
        { ok: false, error: "รหัสบุคลากรไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      full_name?: unknown;
      department?: unknown;
      is_active?: unknown;
    } | null;
    const updates: Record<string, string | boolean> = {};

    if (body?.full_name !== undefined) {
      const fullName =
        typeof body.full_name === "string" ? body.full_name.trim() : "";
      if (!fullName || fullName.length > 200) {
        return NextResponse.json(
          { ok: false, error: "ชื่อบุคลากรไม่ถูกต้อง" },
          { status: 400 }
        );
      }
      updates.full_name = fullName;
    }
    if (body?.department !== undefined) {
      if (!isResponsibleUnit(body.department)) {
        return NextResponse.json(
          { ok: false, error: "สังกัดไม่ถูกต้อง" },
          { status: 400 }
        );
      }
      updates.department = body.department;
    }
    if (body?.is_active !== undefined) {
      if (typeof body.is_active !== "boolean") {
        return NextResponse.json(
          { ok: false, error: "สถานะบุคลากรไม่ถูกต้อง" },
          { status: 400 }
        );
      }
      updates.is_active = body.is_active;
    }
    if (!Object.keys(updates).length) {
      return NextResponse.json(
        { ok: false, error: "ไม่มีข้อมูลที่ต้องแก้ไข" },
        { status: 400 }
      );
    }

    const { data, error } = await getServerSupabase()
      .from("people")
      .update(updates)
      .eq("id", params.id)
      .select("id, full_name, department, is_active, created_at, updated_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบบุคลากร" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("[people][PATCH]", error);
    return NextResponse.json(
      { ok: false, error: "แก้ไขบุคลากรไม่สำเร็จ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
