import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const getSupabaseAdmin = () => {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawIds = searchParams.get("ids") ?? "";
    const ids = rawIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("special_watchlist_customers")
      .select(
        "id, customer_name, contact_name, contact_phone, address, subdistrict, impact_reason, care_note, latitude, longitude"
      )
      .in("id", ids);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    console.error("[special-watchlist][by-ids][GET]", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถโหลดรายละเอียดกลุ่มเฝ้าระวังพิเศษได้" },
      { status: 500 }
    );
  }
}
