import { NextResponse } from "next/server";
import { clearAuthCookies, setAuthCookies } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const accessToken = body?.accessToken as string | undefined;
  const refreshToken = body?.refreshToken as string | undefined;

  if (!accessToken || !refreshToken) {
    return NextResponse.json(
      { ok: false, message: "MISSING_TOKENS" },
      { status: 400 }
    );
  }

  const response = NextResponse.json({ ok: true });
  setAuthCookies(response, { accessToken, refreshToken });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
