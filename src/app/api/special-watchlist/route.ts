import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const getServerSupabase = () => {
  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL env var.");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
};

type Payload = {
  customer_name?: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  subdistrict?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  impact_reason?: string | null;
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
      .from("special_watchlist_customers")
      .select("id, customer_name, contact_name, contact_phone, address, subdistrict, latitude, longitude, impact_reason, care_note, status")
      .eq("status", statusFilter)
      .order("created_at", { ascending: false });

    if (q) {
      const escaped = q.replace(/[%_]/g, "\\$&");
      const keyword = `%${escaped}%`;
      query = query.or([
        `customer_name.ilike.${keyword}`,
        `contact_name.ilike.${keyword}`,
        `contact_phone.ilike.${keyword}`,
        `address.ilike.${keyword}`,
        `subdistrict.ilike.${keyword}`,
        `impact_reason.ilike.${keyword}`,
        `care_note.ilike.${keyword}`
      ].join(","));
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: "ไม่สามารถดึงข้อมูลกลุ่มเฝ้าระวังพิเศษได้ กรุณาลองใหม่อีกครั้ง" }, { status: 400 });

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    console.error("[special-watchlist][GET]", error);
    return NextResponse.json({ ok: false, error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Payload;
    const customerName = body.customer_name?.trim();
    if (!customerName) return NextResponse.json({ ok: false, error: "กรุณาระบุชื่อผู้ใช้ไฟ/สถานที่" }, { status: 400 });

    const supabase = getServerSupabase();
    const { error } = await supabase.from("special_watchlist_customers").insert({
      customer_name: customerName,
      contact_name: body.contact_name ?? null,
      contact_phone: body.contact_phone ?? null,
      address: body.address ?? null,
      subdistrict: body.subdistrict ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      impact_reason: body.impact_reason ?? null,
      care_note: body.care_note ?? null
    });

    if (error) return NextResponse.json({ ok: false, error: "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[special-watchlist][POST]", error);
    return NextResponse.json({ ok: false, error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
