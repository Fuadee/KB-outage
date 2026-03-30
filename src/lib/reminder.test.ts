import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addDaysToDateOnly,
  computeBangkokTodayDateOnly,
  computeNextScheduledRunAt,
  computeSameDayPlannedNotifyDate,
  deriveReminderReadinessStatus,
  formatSameDayReminderMessage,
  getReminderMissingEnvKeys,
  getSameDayReminderSkipReason,
  normalizeDateOnly,
  parseTimeHHmm,
  shouldRunAtBangkokEight,
} from "./reminder.ts";
import { reminderConfig } from "./reminderConfig.ts";

test("computeBangkokTodayDateOnly uses Bangkok timezone date", () => {
  const now = new Date("2026-03-14T00:30:00Z"); // 07:30 Bangkok
  assert.equal(computeBangkokTodayDateOnly(now), "2026-03-14");
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

test("hardcoded reminder config keeps same-day only values", () => {
  assert.equal(reminderConfig.timezone, "Asia/Bangkok");
  assert.equal(reminderConfig.allowSameDayReminder, true);
  assert.equal(reminderConfig.sameDayRunDisplayTime, "08:00");
  assert.equal("leadDays" in reminderConfig, false);
  assert.equal("reminderRunDisplayTime" in reminderConfig, false);
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

test("lead reminder route has been removed", () => {
  const sameDayRouteSource = readFileSync(
    new URL("../app/api/jobs/reminder/same-day/run/route.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(sameDayRouteSource, /line_reminder_sent_at/);
  assert.doesNotMatch(sameDayRouteSource, /formatLeadReminderMessage/);
  assert.doesNotMatch(sameDayRouteSource, /getReminderSkipReason/);
});

test("normalize and date math are date-only safe", () => {
  assert.equal(normalizeDateOnly("2026-03-19T00:00:00.000Z"), "2026-03-19");
  assert.equal(addDaysToDateOnly("2026-03-14", 5), "2026-03-19");
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

test("same-day planned notify date helper works", () => {
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

test("getReminderMissingEnvKeys returns all missing keys", () => {
  const missing = getReminderMissingEnvKeys({
    timezone: "Asia/Bangkok",
    hasLineToken: false,
    hasLineTargetId: true,
    hasSupabaseUrl: false,
    hasSupabaseServiceRoleKey: false,
    routeReady: false,
  });
  assert.deepEqual(missing, ["LINE_CHANNEL_ACCESS_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
});

test("app shell navigation does not expose reminder settings UI", () => {
  const sidebarSource = readFileSync(new URL("../components/layout/Sidebar.tsx", import.meta.url), "utf8");
  const topNavSource = readFileSync(new URL("../components/layout/TopNav.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(sidebarSource, /\/settings\/reminders/);
  assert.doesNotMatch(sidebarSource, /Reminder Settings/);
  assert.doesNotMatch(topNavSource, /\/settings\/reminders/);
  assert.doesNotMatch(topNavSource, /Reminder Settings/);
});
