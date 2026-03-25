import { NextResponse } from "next/server";
import {
  getReminderSettings,
  updateReminderSettings,
  validateReminderSettingsInput,
} from "@/lib/reminderSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const payloadRecord =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null;
    console.log("reminder-settings-save-request-body", {
      method: "PUT",
      fields: payloadRecord ? Object.keys(payloadRecord) : [],
      lead_reminder_time: payloadRecord?.lead_reminder_time ?? null,
      same_day_reminder_time: payloadRecord?.same_day_reminder_time ?? null,
    });
    if (payloadRecord && !("same_day_reminder_time" in payloadRecord)) {
      console.log("reminder-settings-save-missing-same-day-field", {
        method: "PUT",
        fields: Object.keys(payloadRecord),
        lead_reminder_time: payloadRecord.lead_reminder_time ?? null,
        same_day_reminder_time: null,
      });
    }
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

    const settingsBefore = await getReminderSettings();
    console.log("reminder-settings-save-before-row", {
      id: settingsBefore.id,
      lead_reminder_time: settingsBefore.lead_reminder_time,
      same_day_reminder_time: settingsBefore.same_day_reminder_time,
    });
    console.log("reminder-settings-save-update-payload", {
      lead_reminder_time: validation.value.lead_reminder_time ?? null,
      same_day_reminder_time: validation.value.same_day_reminder_time ?? null,
    });
    const settings = await updateReminderSettings(validation.value);
    console.log("reminder-settings-save-after-row", {
      id: settings.id,
      lead_reminder_time: settings.lead_reminder_time,
      same_day_reminder_time: settings.same_day_reminder_time,
    });
    console.log("reminder-settings-save-success", {
      method: "PUT",
      id: settings.id,
      timezone: settings.timezone,
      changedFields: {
        lead_reminder_time: { before: settingsBefore.lead_reminder_time, after: settings.lead_reminder_time },
        same_day_reminder_time: { before: settingsBefore.same_day_reminder_time, after: settings.same_day_reminder_time },
        lead_reminder_days: { before: settingsBefore.lead_reminder_days, after: settings.lead_reminder_days },
      },
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
