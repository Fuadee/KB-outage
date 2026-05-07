import { NextResponse } from "next/server";
import { fetchAndParseGoogleMyMapKml } from "@/lib/googleMyMapsKml";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mid = searchParams.get("mid")?.trim();

  if (!mid) {
    return NextResponse.json({ ok: false, error: "missing mid" }, { status: 400 });
  }

  try {
    const result = await fetchAndParseGoogleMyMapKml(mid);
    return NextResponse.json({
      ok: true,
      mid,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mid,
        error: error instanceof Error ? error.message : "unknown error"
      },
      { status: 500 }
    );
  }
}
