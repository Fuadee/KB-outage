import test from "node:test";
import assert from "node:assert/strict";
import {
  addDaysToDateOnly,
  computeBangkokTodayDateOnly,
  computeTargetOutageDate,
  formatSameDayReminderMessage,
  getReminderSkipReason,
  getSameDayReminderSkipReason,
  normalizeDateOnly,
  shouldRunAtBangkokEight,
} from "./reminder.ts";

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
