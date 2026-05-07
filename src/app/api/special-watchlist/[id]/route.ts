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
  status?: "ACTIVE" | "INACTIVE";
};

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    if (!params.id) return NextResponse.json({ ok: false, error: "ไม่พบรหัสรายการ" }, { status: 400 });

    const body = (await request.json()) as Payload;
    const payload = {
      ...(body.customer_name !== undefined ? { customer_name: body.customer_name.trim() } : {}),
      ...(body.contact_name !== undefined ? { contact_name: body.contact_name } : {}),
      ...(body.contact_phone !== undefined ? { contact_phone: body.contact_phone } : {}),
      ...(body.address !== undefined ? { address: body.address } : {}),
      ...(body.subdistrict !== undefined ? { subdistrict: body.subdistrict } : {}),
      ...(body.latitude !== undefined ? { latitude: body.latitude } : {}),
      ...(body.longitude !== undefined ? { longitude: body.longitude } : {}),
      ...(body.impact_reason !== undefined ? { impact_reason: body.impact_reason } : {}),
      ...(body.care_note !== undefined ? { care_note: body.care_note } : {}),
      ...(body.status !== undefined ? { status: body.status } : {})
    };

    const supabase = getServerSupabase();
    const { error } = await supabase.from("special_watchlist_customers").update(payload).eq("id", params.id);

    if (error) return NextResponse.json({ ok: false, error: "ไม่สามารถอัปเดตข้อมูลได้ กรุณาลองใหม่อีกครั้ง" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[special-watchlist][PATCH]", error);
    return NextResponse.json({ ok: false, error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
