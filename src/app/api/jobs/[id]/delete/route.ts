import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, getAuthTokens } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createSupabaseAdminClient() {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export async function DELETE(
  _request: Request,
  context: { params: { id: string } }
) {
  try {
    const { accessToken } = getAuthTokens();
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const authClient = createServerClient();
    const {
      data: { user },
      error: userError
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const jobId = context.params.id;
    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "missing job id" },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();
    const { data: deletedRows, error: deleteError } = await admin
      .from("outage_jobs")
      .delete()
      .eq("id", jobId)
      .select("id");

    if (deleteError) {
      throw deleteError;
    }

    const deletedCount = deletedRows?.length ?? 0;

    if (process.env.NODE_ENV !== "production") {
      console.info("Delete job result", { jobId, deletedCount });
    }

    if (deletedCount === 0) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบข้อมูลงานที่ต้องการ", deletedCount },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, deletedCount });
  } catch (error) {
    console.error("Delete job failed", error);
    return NextResponse.json(
      { ok: false, error: "ลบไม่สำเร็จ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
