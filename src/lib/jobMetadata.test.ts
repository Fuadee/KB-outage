import assert from "node:assert/strict";
import test from "node:test";
import {
  getResponsibleUnitLabel,
  getResponsibleUnitShortLabel,
  getSwitchingLabel,
  formatCustomerCount,
  isResponsibleUnit,
  parseCustomerCount,
  RESPONSIBLE_UNITS
} from "./jobMetadata.ts";

test("exposes only the three required responsible-unit choices", () => {
  assert.deepEqual(RESPONSIBLE_UNITS, [
    "แผนกปฏิบัติการ",
    "แผนกก่อสร้าง",
    "กฟส.อ่าวนาง"
  ]);
});

test("validates responsible units using the shared whitelist", () => {
  for (const unit of RESPONSIBLE_UNITS) {
    assert.equal(isResponsibleUnit(unit), true);
  }
  assert.equal(isResponsibleUnit(""), false);
  assert.equal(isResponsibleUnit("แผนกอื่น"), false);
  assert.equal(isResponsibleUnit(null), false);
});

test("shows a subdued fallback label for legacy jobs without a unit", () => {
  assert.equal(getResponsibleUnitLabel(null), "ไม่ระบุหน่วยงาน");
  assert.equal(
    getResponsibleUnitLabel("แผนกปฏิบัติการ"),
    "แผนกปฏิบัติการ"
  );
});

test("maps calendar-only short labels and preserves a legacy fallback", () => {
  assert.equal(getResponsibleUnitShortLabel("แผนกปฏิบัติการ"), "ผปบ.");
  assert.equal(getResponsibleUnitShortLabel("แผนกก่อสร้าง"), "ผกส.");
  assert.equal(getResponsibleUnitShortLabel("กฟส.อ่าวนาง"), "อ่าวนาง");
  assert.equal(getResponsibleUnitShortLabel(null), "ไม่ระบุ");
  assert.equal(getResponsibleUnitShortLabel("หน่วยงานที่ไม่รู้จัก"), "ไม่ระบุ");
});

test("normalizes optional customer counts to a nullable non-negative integer", () => {
  assert.deepEqual(parseCustomerCount(""), { success: true, value: null });
  assert.deepEqual(parseCustomerCount("   "), { success: true, value: null });
  assert.deepEqual(parseCustomerCount(null), { success: true, value: null });
  assert.deepEqual(parseCustomerCount(0), { success: true, value: 0 });
  assert.deepEqual(parseCustomerCount("350"), { success: true, value: 350 });
  assert.equal(parseCustomerCount(-1).success, false);
  assert.equal(parseCustomerCount(1.5).success, false);
  assert.equal(parseCustomerCount("1e2").success, false);
  assert.equal(parseCustomerCount("0x10").success, false);
  assert.equal(parseCustomerCount("350 ราย").success, false);
});

test("formats customer counts with thousands separators", () => {
  assert.equal(formatCustomerCount(0), "0");
  assert.equal(formatCustomerCount(350), "350");
  assert.equal(formatCustomerCount(1250), "1,250");
});

test("formats explicit and legacy Switching values", () => {
  assert.equal(getSwitchingLabel(true), "มี");
  assert.equal(getSwitchingLabel(false), "ไม่มี");
  assert.equal(getSwitchingLabel(null), "ยังไม่ได้ระบุ");
  assert.equal(getSwitchingLabel(undefined), "ยังไม่ได้ระบุ");
});
