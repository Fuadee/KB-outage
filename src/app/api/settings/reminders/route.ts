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
  console.log("reminder-settings-save-start", { method: "PUT" });

  try {
    const payload = await request.json().catch(() => null);
    const validation = validateReminderSettingsInput(payload, "partial");

    if (!validation.ok) {
      console.log("reminder-settings-save-failed", {
        method: "PUT",
        error: validation.error,
        reason: "validation",
      });
      console.log("reminder-settings-save-end", { method: "PUT", ok: false });
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }

    const settings = await updateReminderSettings(validation.value);
    console.log("reminder-settings-save-success", {
      method: "PUT",
      id: settings.id,
      timezone: settings.timezone,
    });
    console.log("reminder-settings-save-end", { method: "PUT", ok: true });

    return NextResponse.json({ ok: true, message: "saved", settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log("reminder-settings-save-failed", {
      method: "PUT",
      error: message,
      reason: "server",
    });
    console.log("reminder-settings-save-end", { method: "PUT", ok: false });

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
