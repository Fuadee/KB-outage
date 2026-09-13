import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isResponsibleUnit } from "@/lib/jobMetadata";
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active") ?? "true";
    const department = searchParams.get("department");
    const q = searchParams.get("q")?.trim() ?? "";

    if (
      !["true", "false", "all"].includes(active) ||
      (department !== null && !isResponsibleUnit(department))
    ) {
      return NextResponse.json(
        { ok: false, error: "ตัวกรองบุคลากรไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    let query = getServerSupabase()
      .from("people")
      .select("id, full_name, department, is_active, created_at, updated_at")
      .order("full_name", { ascending: true });

    if (active !== "all") query = query.eq("is_active", active === "true");
    if (department) query = query.eq("department", department);
    if (q) {
      const escaped = q.replace(/[%_]/g, "\\$&");
      query = query.ilike("full_name", `%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    console.error("[people][GET]", error);
    return NextResponse.json(
      { ok: false, error: "โหลดรายชื่อบุคลากรไม่สำเร็จ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      full_name?: unknown;
      department?: unknown;
    } | null;
    const fullName =
      typeof body?.full_name === "string" ? body.full_name.trim() : "";

    if (
      !fullName ||
      fullName.length > 200 ||
      !isResponsibleUnit(body?.department)
    ) {
      return NextResponse.json(
        { ok: false, error: "กรุณาระบุชื่อและสังกัดให้ถูกต้อง" },
        { status: 400 }
      );
    }

    const { data, error } = await getServerSupabase()
      .from("people")
      .insert({
        full_name: fullName,
        department: body.department,
        is_active: true
      })
      .select("id, full_name, department, is_active, created_at, updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    console.error("[people][POST]", error);
    return NextResponse.json(
      { ok: false, error: "เพิ่มบุคลากรไม่สำเร็จ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
