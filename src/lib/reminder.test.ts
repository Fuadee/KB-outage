import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addDaysToDateOnly,
  computeBangkokTodayDateOnly,
  computeTargetOutageDate,
  formatSameDayReminderMessage,
  getReminderSkipReason,
  getSameDayReminderSkipReason,
  isWithinScheduledWindowBangkok,
  normalizeDateOnly,
  parseTimeHHmm,
  shouldRunAtBangkokEight,
} from "./reminder.ts";
import { validateReminderSettingsInput } from "./reminderSettings.ts";

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
  assert.deepEqual(parseTimeHHmm("14:30"), { hour: 14, minute: 30 });
  assert.equal(parseTimeHHmm("24:10"), null);
  assert.equal(parseTimeHHmm("2:10"), null);
});

test("schedule window allows only configured 5-minute range", () => {
  assert.equal(
    isWithinScheduledWindowBangkok(new Date("2026-03-14T14:29:00+07:00"), "14:30"),
    false
  );
  assert.equal(
    isWithinScheduledWindowBangkok(new Date("2026-03-14T14:30:00+07:00"), "14:30"),
    true
  );
  assert.equal(
    isWithinScheduledWindowBangkok(new Date("2026-03-14T14:34:00+07:00"), "14:30"),
    true
  );
  assert.equal(
    isWithinScheduledWindowBangkok(new Date("2026-03-14T14:35:00+07:00"), "14:30"),
    false
  );
});

test("reminder settings default payload is loadable", () => {
  const result = validateReminderSettingsInput({}, "full");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.timezone, "Asia/Bangkok");
  assert.equal(result.value.lead_reminder_days, 5);
  assert.equal(result.value.lead_reminder_time, "08:00");
  assert.equal(result.value.same_day_reminder_time, "14:30");
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
  assert.match(source, /same_day_reminder_time/);
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
  });
  const noCode = formatSameDayReminderMessage({
    equipmentCode: null,
    outageDate: "2026-03-14",
  });

  assert.match(withCode, /แจ้งเตือนการดับไฟ \(วันนี้\)/);
  assert.match(withCode, /งาน: TR-001/);
  assert.match(noCode, /งาน: -/);
  assert.doesNotMatch(withCode, /เหลือเวลา 5 วัน/);
});
