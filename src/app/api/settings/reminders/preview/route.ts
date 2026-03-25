import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeDateOnly } from "@/lib/reminder";
import { buildReminderPreview } from "@/lib/reminderPreview";

export const runtime = "nodejs";

function createServiceRoleClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(request: NextRequest) {
  const previewDate = normalizeDateOnly(request.nextUrl.searchParams.get("previewDate"));

  console.log("reminder-preview-start", {
    method: "GET",
    previewDate,
  });

  try {
    const supabase = createServiceRoleClient();

    console.log("reminder-preview-settings-loaded", { previewDate });
    console.log("reminder-preview-lead-query-start", { previewDate });
    console.log("reminder-preview-same-day-query-start", { previewDate });

    const preview = await buildReminderPreview({
      supabase,
      previewDate,
    });

    console.log("reminder-preview-lead-query-end", {
      targetDate: preview.leadPreview.targetDate,
      matched: preview.leadPreview.matched,
      eligible: preview.leadPreview.eligible,
      skipped: preview.leadPreview.skipped,
    });
    console.log("reminder-preview-same-day-query-end", {
      targetDate: preview.sameDayPreview.targetDate,
      matched: preview.sameDayPreview.matched,
      eligible: preview.sameDayPreview.eligible,
      skipped: preview.sameDayPreview.skipped,
    });
    console.log("reminder-preview-end", {
      ok: true,
      previewDate,
      generatedAt: preview.generatedAt,
      isSystemReady: preview.systemStatus.isSystemReady,
      nextLeadRunAt: preview.systemStatus.nextLeadRunAt,
      nextSameDayRunAt: preview.systemStatus.nextSameDayRunAt,
    });

    return NextResponse.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log("reminder-preview-end", { ok: false, error: message, previewDate });

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
