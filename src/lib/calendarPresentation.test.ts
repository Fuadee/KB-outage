import assert from "node:assert/strict";
import test from "node:test";
import {
  CALENDAR_FLOW_STEPS,
  formatThaiCalendarMonth,
  getCalendarStatusLabel,
  THAI_CALENDAR_DAY_LABELS
} from "./calendarPresentation.ts";

test("translates every calendar status without changing its source value", () => {
  assert.equal(getCalendarStatusLabel("Done"), "ปิดงานแล้ว");
  assert.equal(getCalendarStatusLabel("Posted"), "ลงสื่อแล้ว");
  assert.equal(getCalendarStatusLabel("Doc"), "เอกสาร");
  assert.equal(getCalendarStatusLabel("Notice"), "แจ้งดับไฟแล้ว");
  assert.equal(getCalendarStatusLabel("Draft"), "เตรียมงาน");
  assert.equal(getCalendarStatusLabel("FutureStatus"), "FutureStatus");
});

test("provides the six explanatory workflow steps in their required order", () => {
  assert.deepEqual(CALENDAR_FLOW_STEPS, [
    "สร้างเอกสาร",
    "รับเอกสาร",
    "ส่งเอกสาร",
    "แจ้งดับไฟแล้ว",
    "ลงสื่อแล้ว",
    "ปิดงาน"
  ]);
});

test("provides Thai day labels and Buddhist Era month text", () => {
  assert.deepEqual(THAI_CALENDAR_DAY_LABELS, [
    "อา.",
    "จ.",
    "อ.",
    "พ.",
    "พฤ.",
    "ศ.",
    "ส."
  ]);
  assert.equal(formatThaiCalendarMonth(new Date(2026, 8, 1)), "กันยายน 2569");
});
