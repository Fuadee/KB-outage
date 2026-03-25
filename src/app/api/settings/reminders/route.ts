import { NextResponse } from "next/server";
import {
  getReminderSettings,
  updateReminderSettings,
  validateReminderSettingsInput,
} from "@/lib/reminderSettings";

export const runtime = "nodejs";

export async function GET() {
  try {
    console.log("reminder-settings-load-start", { method: "GET" });
    const settings = await getReminderSettings();
    console.log("reminder-settings-load-end", {
      method: "GET",
      id: settings.id,
      timezone: settings.timezone,
    });

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    const validation = validateReminderSettingsInput(payload, "partial");

    if (!validation.ok) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }

    console.log("reminder-settings-load-start", { method: "PUT" });
    const settings = await updateReminderSettings(validation.value);
    console.log("reminder-settings-load-end", {
      method: "PUT",
      id: settings.id,
      timezone: settings.timezone,
    });

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
