import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const getServerSupabase = () => {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
};

type Payload = {
  patient_name?: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  subdistrict?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  power_dependency_note?: string | null;
  care_note?: string | null;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim() ?? "";
    const statusFilter = status === "INACTIVE" ? "INACTIVE" : "ACTIVE";

    const supabase = getServerSupabase();
    let query = supabase
      .from("bedridden_patients")
      .select("id, patient_name, contact_name, contact_phone, address, subdistrict, latitude, longitude, power_dependency_note, care_note, status")
      .eq("status", statusFilter)
      .order("created_at", { ascending: false });

    if (q) {
      const escaped = q.replace(/[%_]/g, "\\$&");
      const keyword = `%${escaped}%`;
      query = query.or(
        [
          `patient_name.ilike.${keyword}`,
          `contact_name.ilike.${keyword}`,
          `contact_phone.ilike.${keyword}`,
          `address.ilike.${keyword}`,
          `subdistrict.ilike.${keyword}`,
          `power_dependency_note.ilike.${keyword}`,
          `care_note.ilike.${keyword}`
        ].join(",")
      );
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: "ไม่สามารถดึงข้อมูลผู้ป่วยได้ กรุณาลองใหม่อีกครั้ง" }, { status: 400 });
    }

    console.log("[bedridden-patients][GET]", { status: statusFilter, q, rows: data?.length ?? 0 });
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    console.error("[bedridden-patients][GET]", error);
    return NextResponse.json({ ok: false, error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Payload;
    const patientName = body.patient_name?.trim();
    if (!patientName) {
      return NextResponse.json({ ok: false, error: "กรุณาระบุชื่อผู้ป่วย" }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { error } = await supabase.from("bedridden_patients").insert({
      patient_name: patientName,
      contact_name: body.contact_name ?? null,
      contact_phone: body.contact_phone ?? null,
      address: body.address ?? null,
      subdistrict: body.subdistrict ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      power_dependency_note: body.power_dependency_note ?? null,
      care_note: body.care_note ?? null
    });

    if (error) {
      return NextResponse.json({ ok: false, error: "ไม่สามารถบันทึกข้อมูลผู้ป่วยได้ กรุณาลองใหม่อีกครั้ง" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[bedridden-patients][POST]", error);
    return NextResponse.json({ ok: false, error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
