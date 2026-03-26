import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addDaysToDateOnly,
  computeBangkokTodayDateOnly,
  computeLeadPlannedNotifyDate,
  computeNextScheduledRunAt,
  computeSameDayPlannedNotifyDate,
  computeTargetOutageDate,
  deriveReminderReadinessStatus,
  formatLeadReminderMessage,
  formatSameDayReminderMessage,
  getReminderMissingEnvKeys,
  getReminderSkipReason,
  getSameDayReminderSkipReason,
  normalizeDateOnly,
  parseTimeHHmm,
  shouldRunAtBangkokEight,
} from "./reminder.ts";

import { buildPreviewSection } from "./reminderPreview.ts";
import { buildReminderPreview } from "./reminderPreview.ts";
import { updateReminderSettings, validateReminderSettingsInput } from "./reminderSettings.ts";

test("today 2026-03-14 should target outage_date 2026-03-19", () => {
  const now = new Date("2026-03-14T02:00:00+07:00");
  const targetDate = computeTargetOutageDate({ now });
  assert.equal(targetDate, "2026-03-19");
});

test("08:00 Asia/Bangkok is detected correctly", () => {
  const bangkok8 = new Date("2026-03-14T08:00:00+07:00");
  const bangkok759 = new Date("2026-03-14T07:59:00+07:00");

  assert.equal(shouldRunAtBangkokEight(bangkok8), true);
  assert.equal(shouldRunAtBangkokEight(bangkok759), false);
});

test("parseTimeHHmm validates HH:mm format", () => {
  assert.deepEqual(parseTimeHHmm("08:15"), { hour: 8, minute: 15 });
  assert.equal(parseTimeHHmm("24:10"), null);
  assert.equal(parseTimeHHmm("2:10"), null);
});

test("reminder settings default payload is loadable", () => {
  const result = validateReminderSettingsInput({}, "full");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.timezone, "Asia/Bangkok");
  assert.equal(result.value.lead_reminder_days, 5);
  assert.equal(result.value.lead_reminder_time, "08:00");
  assert.equal(result.value.same_day_reminder_time, "08:00");
});

test("reminder settings validate lead_reminder_days bounds", () => {
  const invalid = validateReminderSettingsInput({ lead_reminder_days: 31 }, "partial");
  assert.equal(invalid.ok, false);
  const valid = validateReminderSettingsInput({ lead_reminder_days: 0 }, "partial");
  assert.equal(valid.ok, true);
});

test("lead reminder route reads settings from DB helper", () => {
  const source = readFileSync(
    new URL("../app/api/jobs/reminder/run/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /getReminderSettings/);
  assert.doesNotMatch(source, /REMINDER_LEAD_DAYS/);
});

test("same-day reminder route reads settings from DB helper", () => {
  const source = readFileSync(
    new URL("../app/api/jobs/reminder/same-day/run/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /getReminderSettings/);
  assert.doesNotMatch(source, /isWithinScheduledWindowBangkok/);
});

test("manual same-day route requires authenticated user", () => {
  const source = readFileSync(
    new URL("../app/api/jobs/reminder/same-day/run/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /getAuthTokens/);
  assert.match(source, /createServerClient/);
  assert.match(source, /UNAUTHENTICATED/);
});

test("normalize and date math are date-only safe", () => {
  assert.equal(normalizeDateOnly("2026-03-19T00:00:00.000Z"), "2026-03-19");
  assert.equal(addDaysToDateOnly("2026-03-14", 5), "2026-03-19");
});

test("manual override date is respected", () => {
  const targetDate = computeTargetOutageDate({
    now: new Date("2026-03-14T08:00:00+07:00"),
    overrideDate: "2026-03-14",
  });

  assert.equal(targetDate, "2026-03-14");
});

test("already sent jobs must not be sent again", () => {
  const reason = getReminderSkipReason(
    { outage_date: "2026-03-19", line_reminder_sent_at: "2026-03-10T01:00:00Z" },
    "2026-03-19"
  );

  assert.equal(reason, "already_sent");
});

test("unsent jobs should be eligible when date matches", () => {
  const reason = getReminderSkipReason(
    { outage_date: "2026-03-19", line_reminder_sent_at: null },
    "2026-03-19"
  );

  assert.equal(reason, null);
});

test("same-day target date uses Bangkok current day", () => {
  const now = new Date("2026-03-14T00:30:00+07:00");
  assert.equal(computeBangkokTodayDateOnly(now), "2026-03-14");
});

test("same-day skips when same-day reminder was already sent", () => {
  const reason = getSameDayReminderSkipReason(
    {
      outage_date: "2026-03-14",
      line_same_day_reminder_sent_at: "2026-03-14T08:00:00Z",
      line_reminder_sent_at: null,
    },
    "2026-03-14"
  );

  assert.equal(reason, "already_sent_same_day");
});

test("same-day skips closed/done jobs", () => {
  const closedByFlag = getSameDayReminderSkipReason(
    {
      outage_date: "2026-03-14",
      line_same_day_reminder_sent_at: null,
      is_closed: true,
    },
    "2026-03-14"
  );

  const closedByStatus = getSameDayReminderSkipReason(
    {
      outage_date: "2026-03-14",
      line_same_day_reminder_sent_at: null,
      status: "done",
    },
    "2026-03-14"
  );

  assert.equal(closedByFlag, "is_closed=true");
  assert.equal(closedByStatus, "status=done");
});

test("same-day eligible when outage_date is today and unsent", () => {
  const reason = getSameDayReminderSkipReason(
    {
      outage_date: "2026-03-14",
      line_same_day_reminder_sent_at: null,
      line_reminder_sent_at: "2026-03-09T01:00:00Z",
    },
    "2026-03-14"
  );

  assert.equal(reason, null);
});

test("same-day message is today tone and has equipment fallback", () => {
  const withCode = formatSameDayReminderMessage({
    equipmentCode: "TR-001",
    outageDate: "2026-03-14",
    mapLink: "https://maps.google.com/?q=13.7563,100.5018",
  });
  const noCode = formatSameDayReminderMessage({
    equipmentCode: null,
    outageDate: "2026-03-14",
    mapLink: null,
  });

  assert.match(withCode, /แจ้งเตือนการดับไฟ \(วันนี้\)/);
  assert.match(withCode, /งาน: TR-001/);
  assert.match(withCode, /📍 พื้นที่ดับไฟ \(ดูแผนที่\):/);
  assert.match(withCode, /https:\/\/maps\.google\.com\/\?q=13\.7563,100\.5018/);
  assert.match(withCode, /https:\/\/kb-outage\.vercel\.app\/calendar/);
  assert.match(withCode, /📢 เตรียมความพร้อมก่อนปฏิบัติงาน/);
  assert.doesNotMatch(withCode, /กรุณาดำเนินการแจ้งผู้ใช้ไฟฟ้า/);
  assert.match(noCode, /งาน: -/);
  assert.match(noCode, /📍 พื้นที่ดับไฟ \(ดูแผนที่\):\n-/);
  assert.doesNotMatch(withCode, /เหลือเวลา 5 วัน/);
});


test("lead reminder message uses Thai date format and lead days", () => {
  const text = formatLeadReminderMessage({
    equipmentCode: "TR-001",
    outageDate: "2026-03-19",
    leadDays: 3,
  });

  assert.match(text, /แจ้งเตือนเตรียมขอดับไฟ/);
  assert.match(text, /งาน: TR-001/);
  assert.match(text, /19 มี\.ค\. 2569/);
  assert.match(text, /เหลือเวลา 3 วัน/);
});

test("preview section marks reminder_disabled skip reason when section disabled", () => {
  const section = buildPreviewSection({
    enabled: false,
    targetDate: "2026-03-14",
    scheduleTime: "08:00",
    nextRunAt: "2026-03-14T08:00:00+07:00",
    summaryText: "summary",
    jobs: [
      {
        id: 1,
        equipment_code: "TR-001",
        outage_date: "2026-03-19",
        line_reminder_sent_at: null,
        line_same_day_reminder_sent_at: null,
      },
    ],
    statusFieldExists: true,
    todayDate: "2026-03-14",
    notificationType: "lead",
    leadDays: 5,
    getSkipReason: () => null,
    formatMessage: () => "preview-message",
  });

  assert.equal(section.eligible, 0);
  assert.equal(section.skipped, 1);
  assert.equal(section.items[0]?.wouldSend, false);
  assert.equal(section.items[0]?.skipReason, "reminder_disabled");
  assert.equal(section.items[0]?.readinessStatus, "disabled");
});

test("preview route remains preview-only and avoids side effects", () => {
  const source = readFileSync(
    new URL("../app/api/settings/reminders/preview/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /buildReminderPreview/);
  assert.doesNotMatch(source, /line_reminder_sent_at/);
  assert.doesNotMatch(source, /line_same_day_reminder_sent_at/);
  assert.doesNotMatch(source, /api\.line\.me/);
});


test("plannedNotifyDate for lead is outage_date minus lead days", () => {
  assert.equal(computeLeadPlannedNotifyDate("2026-03-31", 5), "2026-03-26");
});

test("plannedNotifyDate for same-day equals outage_date", () => {
  assert.equal(computeSameDayPlannedNotifyDate("2026-03-31"), "2026-03-31");
});

test("readinessStatus is scheduled when planned date is not due yet", () => {
  const status = deriveReminderReadinessStatus({
    enabled: true,
    plannedNotifyDate: "2026-03-26",
    todayDate: "2026-03-25",
    isSent: false,
    skipReason: null,
  });

  assert.equal(status, "scheduled");
});

test("readinessStatus is ready_today when planned date is today", () => {
  const status = deriveReminderReadinessStatus({
    enabled: true,
    plannedNotifyDate: "2026-03-26",
    todayDate: "2026-03-26",
    isSent: false,
    skipReason: null,
  });

  assert.equal(status, "ready_today");
});

test("readinessStatus is sent when sent flag exists", () => {
  const status = deriveReminderReadinessStatus({
    enabled: true,
    plannedNotifyDate: "2026-03-26",
    todayDate: "2026-03-26",
    isSent: true,
    skipReason: null,
  });

  assert.equal(status, "sent");
});

test("computeNextScheduledRunAt returns same day when time not passed", () => {
  const next = computeNextScheduledRunAt({
    now: new Date("2026-03-25T07:00:00+07:00"),
    scheduleTime: "08:00",
    timezone: "Asia/Bangkok",
  });

  assert.equal(next, "2026-03-25T08:00:00+07:00");
});

type MockState = {
  reminderSettings: Record<string, unknown>;
  outageJobs: Array<Record<string, unknown>>;
};

function createMockSupabase(state: MockState) {
  return {
    from(table: string) {
      const query: Record<string, unknown> = { table, operation: "select", filters: {} };
      return {
        select() {
          query.operation = query.operation === "update" ? "update-select" : "select";
          return this;
        },
        insert(row: Record<string, unknown>) {
          if (table === "reminder_settings") {
            state.reminderSettings = { ...row };
          }
          query.operation = "insert";
          return this;
        },
        update(row: Record<string, unknown>) {
          query.operation = "update";
          query.updateRow = row;
          return this;
        },
        eq(field: string, value: unknown) {
          (query.filters as Record<string, unknown>)[field] = value;
          return this;
        },
        order() {
          if (table !== "outage_jobs") return Promise.resolve({ data: [], error: null });
          const targetDate = (query.filters as Record<string, unknown>).outage_date;
          const data = state.outageJobs.filter((job) => job.outage_date === targetDate);
          return Promise.resolve({ data, error: null });
        },
        maybeSingle() {
          if (table !== "reminder_settings") return Promise.resolve({ data: null, error: null });
          const id = (query.filters as Record<string, unknown>).id;
          const row = state.reminderSettings.id === id ? state.reminderSettings : null;
          return Promise.resolve({ data: row, error: null });
        },
        single() {
          if (table !== "reminder_settings") return Promise.resolve({ data: null, error: null });
          if (query.operation === "update-select" || query.operation === "update") {
            state.reminderSettings = {
              ...state.reminderSettings,
              ...(query.updateRow as Record<string, unknown>),
            };
          }
          return Promise.resolve({ data: state.reminderSettings, error: null });
        },
      };
    },
  };
}

test("save settings persists same_day_reminder_time to DB layer", async () => {
  const state: MockState = {
    reminderSettings: {
      id: 1,
      timezone: "Asia/Bangkok",
      lead_reminder_enabled: true,
      lead_reminder_days: 5,
      lead_reminder_time: "08:00",
      same_day_reminder_enabled: true,
      same_day_reminder_time: "08:00",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    },
    outageJobs: [],
  };
  const supabase = createMockSupabase(state);
  const saved = await updateReminderSettings({ same_day_reminder_time: "09:45" }, supabase as never);
  assert.equal(saved.same_day_reminder_time, "09:45");
  assert.equal(state.reminderSettings.same_day_reminder_time, "09:45");
});

test("settings page submit payload includes same_day_reminder_time and submit diagnostics", () => {
  const source = readFileSync(
    new URL("../app/(app)/settings/reminders/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /reminder-settings-submit-payload/);
  assert.match(source, /same_day_reminder_time/);
  assert.match(source, /JSON\.stringify\(settings\)/);
});

test("settings save route logs before\/update\/after payload fields for same-day", () => {
  const source = readFileSync(
    new URL("../app/api/settings/reminders/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /reminder-settings-save-request-body/);
  assert.match(source, /reminder-settings-save-update-payload/);
  assert.match(source, /reminder-settings-save-before-row/);
  assert.match(source, /reminder-settings-save-after-row/);
  assert.match(source, /reminder-settings-save-missing-same-day-field/);
  assert.match(source, /same_day_reminder_time/);
});

test("settings save route returns updated DB row in response payload", () => {
  const source = readFileSync(
    new URL("../app/api/settings/reminders/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /message: "saved"/);
  assert.match(source, /settings/);
  assert.match(source, /updateReminderSettings\(validation\.value\)/);
});

test("PUT save flow and preview flow use same reminder settings helper", () => {
  const saveRouteSource = readFileSync(
    new URL("../app/api/settings/reminders/route.ts", import.meta.url),
    "utf8"
  );
  const previewHelperSource = readFileSync(new URL("./reminderPreview.ts", import.meta.url), "utf8");

  assert.match(saveRouteSource, /getReminderSettings/);
  assert.match(saveRouteSource, /updateReminderSettings/);
  assert.match(previewHelperSource, /getReminderSettings/);
});

test("lead and same-day routes share readiness missing-env helper", () => {
  const leadRouteSource = readFileSync(
    new URL("../app/api/jobs/reminder/run/route.ts", import.meta.url),
    "utf8"
  );
  const sameDayRouteSource = readFileSync(
    new URL("../app/api/jobs/reminder/same-day/run/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(leadRouteSource, /getReminderMissingEnvKeys/);
  assert.match(sameDayRouteSource, /getReminderMissingEnvKeys/);
});

test("getReminderMissingEnvKeys returns all missing keys", () => {
  const missing = getReminderMissingEnvKeys({
    timezone: "Asia/Bangkok",
    hasLineToken: false,
    hasLineTargetId: true,
    hasSupabaseUrl: false,
    hasSupabaseServiceRoleKey: false,
    routeLeadReady: false,
    routeSameDayReady: false,
    isSystemReady: false,
  });

  assert.deepEqual(missing, [
    "LINE_CHANNEL_ACCESS_TOKEN",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
});

test("preview/system status/same-day section use same_day_reminder_time from DB", async () => {
  const state: MockState = {
    reminderSettings: {
      id: 1,
      timezone: "Asia/Bangkok",
      lead_reminder_enabled: true,
      lead_reminder_days: 5,
      lead_reminder_time: "08:00",
      same_day_reminder_enabled: true,
      same_day_reminder_time: "09:45",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    },
    outageJobs: [
      {
        id: 1001,
        equipment_code: "TR-1001",
        outage_date: "2026-03-25",
        line_reminder_sent_at: null,
        line_same_day_reminder_sent_at: null,
        status: "open",
        is_closed: false,
      },
    ],
  };
  const preview = await buildReminderPreview({
    supabase: createMockSupabase(state) as never,
    now: new Date("2026-03-25T07:10:00+07:00"),
    previewDate: "2026-03-25",
  });

  assert.equal(preview.settingsDebug.same_day_reminder_time_from_db, "09:45");
  assert.equal(preview.systemStatus.sameDayReminderScheduleTime, "09:45");
  assert.equal(preview.sameDayPreview.scheduleTime, "09:45");
  assert.equal(preview.sameDayPreview.items[0]?.plannedNotifyTime, "09:45");
  assert.equal(preview.systemStatus.nextSameDayRunAt, "2026-03-25T09:45:00+07:00");
});

test("no active hardcoded 14:30 in reminder settings/preview flow", () => {
  const settingsPage = readFileSync(
    new URL("../app/(app)/settings/reminders/page.tsx", import.meta.url),
    "utf8"
  );
  const settingsApi = readFileSync(
    new URL("../app/api/settings/reminders/route.ts", import.meta.url),
    "utf8"
  );
  const previewApi = readFileSync(
    new URL("../app/api/settings/reminders/preview/route.ts", import.meta.url),
    "utf8"
  );
  const previewHelper = readFileSync(new URL("./reminderPreview.ts", import.meta.url), "utf8");

  assert.doesNotMatch(settingsPage, /14:30/);
  assert.doesNotMatch(settingsApi, /14:30/);
  assert.doesNotMatch(previewApi, /14:30/);
  assert.doesNotMatch(previewHelper, /14:30/);
});
