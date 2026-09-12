import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCalendarSummary,
  filterCalendarSummary,
  matchesResponsibleUnitFilter,
  type CalendarSummaryRecord
} from "./calendarSummary.ts";

const DATE = "2026-09-15";

function record(
  responsible_unit: CalendarSummaryRecord["responsible_unit"],
  status: CalendarSummaryRecord["status"],
  has_switching = false
): CalendarSummaryRecord {
  return { date: DATE, responsible_unit, status, has_switching };
}

test("separates two units that share the same status", () => {
  const summary = buildCalendarSummary([
    record("แผนกปฏิบัติการ", "Posted"),
    record("แผนกปฏิบัติการ", "Posted"),
    record("แผนกก่อสร้าง", "Posted")
  ]);

  assert.equal(summary[0].total, 3);
  assert.deepEqual(summary[0].entries, [
    { responsible_unit: "แผนกปฏิบัติการ", status: "Posted", count: 2, switching_count: 0 },
    { responsible_unit: "แผนกก่อสร้าง", status: "Posted", count: 1, switching_count: 0 }
  ]);
});

test("keeps all three units and multiple statuses as distinct dimensions", () => {
  const summary = buildCalendarSummary([
    record("แผนกปฏิบัติการ", "Doc"),
    record("แผนกปฏิบัติการ", "Notice"),
    record("แผนกก่อสร้าง", "Doc"),
    record("กฟส.อ่าวนาง", "Done")
  ]);

  assert.equal(summary[0].total, 4);
  assert.equal(summary[0].entries.length, 4);
  assert.deepEqual(
    summary[0].entries.map((entry) => [entry.responsible_unit, entry.status]),
    [
      ["แผนกปฏิบัติการ", "Doc"],
      ["แผนกก่อสร้าง", "Doc"],
      ["แผนกปฏิบัติการ", "Notice"],
      ["กฟส.อ่าวนาง", "Done"]
    ]
  );
});

test("all filter includes legacy jobs while unit filters exclude them", () => {
  const summary = buildCalendarSummary([
    record("แผนกปฏิบัติการ", "Draft"),
    record("แผนกก่อสร้าง", "Doc"),
    record("กฟส.อ่าวนาง", "Notice"),
    record(null, "Posted")
  ]);

  assert.equal(filterCalendarSummary(summary, "all")[0].total, 4);
  assert.equal(
    filterCalendarSummary(summary, "แผนกปฏิบัติการ")[0].total,
    1
  );
  assert.equal(
    filterCalendarSummary(summary, "แผนกก่อสร้าง")[0].total,
    1
  );
  assert.equal(
    filterCalendarSummary(summary, "กฟส.อ่าวนาง")[0].total,
    1
  );
  assert.equal(
    matchesResponsibleUnitFilter(null, "แผนกปฏิบัติการ"),
    false
  );
  assert.equal(matchesResponsibleUnitFilter(null, "all"), true);
});

test("drops dates with no jobs matching a selected unit", () => {
  const summary = buildCalendarSummary([
    record("แผนกปฏิบัติการ", "Posted")
  ]);

  assert.deepEqual(filterCalendarSummary(summary, "แผนกก่อสร้าง"), []);
});

test("normalizes missing and unknown units as legacy without guessing", () => {
  const summary = buildCalendarSummary([
    record(undefined, "Doc"),
    record("หน่วยงานเดิมที่ไม่รู้จัก", "Doc")
  ]);

  assert.deepEqual(summary[0].entries, [
    { responsible_unit: null, status: "Doc", count: 2, switching_count: 0 }
  ]);
});

test("counts Switching as supplemental calendar information", () => {
  const summary = buildCalendarSummary([
    record("แผนกปฏิบัติการ", "Posted", true),
    record("แผนกปฏิบัติการ", "Posted", false),
    record("แผนกก่อสร้าง", "Posted", true)
  ]);

  assert.equal(summary[0].switching_count, 2);
  assert.deepEqual(
    summary[0].entries.map((entry) => entry.switching_count),
    [1, 1]
  );
  assert.equal(
    filterCalendarSummary(summary, "แผนกปฏิบัติการ")[0].switching_count,
    1
  );
});
