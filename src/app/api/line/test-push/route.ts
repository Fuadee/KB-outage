import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_DEFAULT_TARGET_ID;

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Missing LINE_CHANNEL_ACCESS_TOKEN" },
      { status: 500 }
    );
  }

  if (!to) {
    return NextResponse.json(
      { ok: false, error: "Missing LINE_DEFAULT_TARGET_ID" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const text = body?.text || "⚡ ระบบแจ้งเตือนดับไฟพร้อมใช้งานแล้ว";

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to,
      messages: [
        {
          type: "text",
          text,
        },
      ],
    }),
  });

  const result = await res.text();

  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    result,
  });
}