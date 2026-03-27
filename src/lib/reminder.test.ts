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
import { reminderConfig } from "./reminderConfig.ts";

test("today 2026-03-14 should target outage_date 2026-03-19", () => {
  const now = new Date("2026-03-14T02:00:00+07:00");
  const targetDate = computeTargetOutageDate({ now });
  assert.equal(targetDate, "2026-03-19");
});

test("08:00 Asia/Bangkok is detected correctly", () => {
  assert.equal(shouldRunAtBangkokEight(new Date("2026-03-14T08:00:00+07:00")), true);
  assert.equal(shouldRunAtBangkokEight(new Date("2026-03-14T07:59:00+07:00")), false);
});

test("parseTimeHHmm validates HH:mm format", () => {
  assert.deepEqual(parseTimeHHmm("08:15"), { hour: 8, minute: 15 });
  assert.equal(parseTimeHHmm("24:10"), null);
  assert.equal(parseTimeHHmm("2:10"), null);
});

test("hardcoded reminder config uses expected values", () => {
  assert.equal(reminderConfig.timezone, "Asia/Bangkok");
  assert.equal(reminderConfig.leadReminderEnabled, true);
  assert.equal(reminderConfig.leadReminderDays, 5);
  assert.equal(reminderConfig.sameDayReminderEnabled, true);
  assert.equal(reminderConfig.cronRunTimeDisplay, "08:00");
});

test("lead reminder route uses code config (not DB settings helper)", () => {
  const source = readFileSync(new URL("../app/api/jobs/reminder/run/route.ts", import.meta.url), "utf8");
  assert.match(source, /reminderConfig/);
  assert.doesNotMatch(source, /getReminderSettings/);
});

test("same-day reminder route uses code config (not DB settings helper)", () => {
  const source = readFileSync(
    new URL("../app/api/jobs/reminder/same-day/run/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /reminderConfig/);
  assert.doesNotMatch(source, /getReminderSettings/);
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

test("same-day skips when same-day reminder was already sent", () => {
  const reason = getSameDayReminderSkipReason(
    { outage_date: "2026-03-14", line_same_day_reminder_sent_at: "2026-03-14T08:00:00Z" },
    "2026-03-14"
  );
  assert.equal(reason, "already_sent_same_day");
});

test("same-day skips closed/done jobs", () => {
  assert.equal(
    getSameDayReminderSkipReason({ outage_date: "2026-03-14", is_closed: true }, "2026-03-14"),
    "is_closed=true"
  );
  assert.equal(
    getSameDayReminderSkipReason({ outage_date: "2026-03-14", status: "done" }, "2026-03-14"),
    "status=done"
  );
});

test("same-day message contains expected sections", () => {
  const withCode = formatSameDayReminderMessage({
    equipmentCode: "TR-001",
    outageDate: "2026-03-14",
    mapLink: "https://maps.google.com/?q=13.7563,100.5018",
  });
  assert.match(withCode, /แจ้งเตือนการดับไฟ \(วันนี้\)/);
  assert.match(withCode, /งาน: TR-001/);
  assert.match(withCode, /https:\/\/kb-outage\.vercel\.app\/calendar/);
});

test("lead reminder message uses Thai date format and lead days", () => {
  const text = formatLeadReminderMessage({ equipmentCode: "TR-001", outageDate: "2026-03-19", leadDays: 3 });
  assert.match(text, /19 มี\.ค\. 2569/);
  assert.match(text, /เหลือเวลา 3 วัน/);
});

test("planned notify date helpers work", () => {
  assert.equal(computeLeadPlannedNotifyDate("2026-03-31", 5), "2026-03-26");
  assert.equal(computeSameDayPlannedNotifyDate("2026-03-31"), "2026-03-31");
});

test("readinessStatus helpers work", () => {
  assert.equal(
    deriveReminderReadinessStatus({ enabled: true, plannedNotifyDate: "2026-03-26", todayDate: "2026-03-25", isSent: false, skipReason: null }),
    "scheduled"
  );
  assert.equal(
    deriveReminderReadinessStatus({ enabled: true, plannedNotifyDate: "2026-03-26", todayDate: "2026-03-26", isSent: false, skipReason: null }),
    "ready_today"
  );
});

test("computeNextScheduledRunAt returns same day when time not passed", () => {
  const next = computeNextScheduledRunAt({
    now: new Date("2026-03-25T07:00:00+07:00"),
    scheduleTime: "08:00",
    timezone: "Asia/Bangkok",
  });
  assert.equal(next, "2026-03-25T08:00:00+07:00");
});

test("lead and same-day routes share readiness missing-env helper", () => {
  const leadRouteSource = readFileSync(new URL("../app/api/jobs/reminder/run/route.ts", import.meta.url), "utf8");
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
  assert.deepEqual(missing, ["LINE_CHANNEL_ACCESS_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
});

test("settings page is read-only and does not call settings/preview APIs", () => {
  const source = readFileSync(new URL("../app/(app)/settings/reminders/page.tsx", import.meta.url), "utf8");
  assert.match(source, /read-only/);
  assert.doesNotMatch(source, /api\/settings\/reminders/);
  assert.doesNotMatch(source, /fetch\(/);
});
