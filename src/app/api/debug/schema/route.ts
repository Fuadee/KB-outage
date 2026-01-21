import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const IS_DEV = process.env.NODE_ENV !== "production";

function createSupabaseServerClient() {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export async function GET() {
  if (!IS_DEV) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const supabase = createSupabaseServerClient();

    const [sampleResult, distinctResult, countResult] = await Promise.all([
      supabase.schema("public").from("outage_jobs").select("*").limit(1),
      supabase
        .schema("public")
        .from("outage_jobs")
        .select("nakhon_status")
        .limit(50),
      supabase
        .schema("public")
        .from("outage_jobs")
        .select("id", { count: "exact", head: true })
    ]);

    if (sampleResult.error) {
      return NextResponse.json(
        {
          ok: false,
          error: sampleResult.error.message,
          hint: sampleResult.error.hint ?? null
        },
        { status: 500 }
      );
    }

    if (distinctResult.error) {
      return NextResponse.json(
        {
          ok: false,
          error: distinctResult.error.message,
          hint: distinctResult.error.hint ?? null
        },
        { status: 500 }
      );
    }

    if (countResult.error) {
      return NextResponse.json(
        {
          ok: false,
          error: countResult.error.message,
          hint: countResult.error.hint ?? null
        },
        { status: 500 }
      );
    }

    const distinctNakhonStatus = Array.from(
      new Set(
        (distinctResult.data ?? [])
          .map((row) => row.nakhon_status)
          .filter((value): value is string => Boolean(value))
      )
    );

    return NextResponse.json({
      sampleRow: sampleResult.data?.[0] ?? null,
      distinctNakhonStatus,
      total: countResult.count ?? 0
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error";
    const hint =
      typeof error === "object" && error !== null && "hint" in error
        ? (error as { hint?: string }).hint ?? null
        : null;
    return NextResponse.json(
      {
        ok: false,
        error: message,
        hint
      },
      { status: 500 }
    );
  }
}
