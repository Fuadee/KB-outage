import assert from "node:assert/strict";
import test from "node:test";
import {
  getDistributionDueDate,
  getDistributionReminderStatus
} from "./distributionReminder.ts";

test("keeps weekday due dates at exactly seven calendar days before outage", () => {
  assert.equal(getDistributionDueDate("2026-09-21"), "2026-09-14");
  assert.equal(getDistributionDueDate("2026-09-22"), "2026-09-15");
});

test("moves Saturday and Sunday base due dates to the following Monday", () => {
  assert.equal(getDistributionDueDate("2026-09-19"), "2026-09-14");
  assert.equal(getDistributionDueDate("2026-09-20"), "2026-09-14");
});

test("derives upcoming, due today, and overdue states", () => {
  const base = { outageDate: "2026-09-21" };

  const upcoming = getDistributionReminderStatus({
    ...base,
    now: new Date("2026-09-12T05:00:00Z")
  });
  assert.equal(upcoming.state, "UPCOMING");
  assert.equal(upcoming.daysUntilDue, 2);

  const dueToday = getDistributionReminderStatus({
    ...base,
    now: new Date("2026-09-14T05:00:00Z")
  });
  assert.equal(dueToday.state, "DUE_TODAY");

  const overdue = getDistributionReminderStatus({
    ...base,
    now: new Date("2026-09-16T05:00:00Z")
  });
  assert.equal(overdue.state, "OVERDUE");
  assert.equal(overdue.daysOverdue, 2);
});

test("confirmed delivery data takes precedence as done", () => {
  const status = getDistributionReminderStatus({
    outageDate: "2026-09-21",
    noticeDate: "2026-09-10",
    noticeBy: "สมชาย",
    noticeStatus: "COMPLETED",
    noticeCompletedAt: "2026-09-10T04:00:00.000Z",
    now: new Date("2026-09-20T05:00:00Z")
  });

  assert.equal(status.state, "DONE");
  assert.equal(status.distributionDate, "2026-09-10");
  assert.equal(status.distributionBy, "สมชาย");
});

test("a scheduled date remains pending until completion is confirmed", () => {
  const status = getDistributionReminderStatus({
    outageDate: "2026-09-21",
    noticeDate: "2026-09-15",
    noticeStatus: "SCHEDULED",
    now: new Date("2026-09-14T05:00:00Z")
  });

  assert.equal(status.state, "UPCOMING");
  assert.equal(status.plannedDate, "2026-09-15");
  assert.equal(status.distributionDate, null);
});

test("uses the Bangkok calendar day around the UTC date boundary", () => {
  const status = getDistributionReminderStatus({
    outageDate: "2026-09-21",
    now: new Date("2026-09-13T17:30:00Z")
  });

  assert.equal(status.state, "DUE_TODAY");
});

test("legacy jobs with missing optional fields do not throw", () => {
  assert.doesNotThrow(() => getDistributionReminderStatus({}));
  assert.equal(
    getDistributionReminderStatus({}).state,
    "OUTAGE_DATE_UNKNOWN"
  );
  assert.equal(
    getDistributionReminderStatus({
      noticeStatus: "SCHEDULED"
    }).state,
    "OUTAGE_DATE_UNKNOWN"
  );
});
