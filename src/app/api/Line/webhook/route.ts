import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  console.log("LINE WEBHOOK EVENT:");
  console.log(JSON.stringify(body, null, 2));

  return NextResponse.json({ ok: true });
}