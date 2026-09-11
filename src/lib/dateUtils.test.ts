import assert from "node:assert/strict";
import test from "node:test";
import { getJobCountdown } from "./dateUtils.ts";

test("keeps the outage countdown without deriving a traffic-light color", () => {
  const countdown = getJobCountdown(
    "2026-09-14",
    new Date(2026, 8, 11, 12)
  );

  assert.deepEqual(countdown, { daysLeft: 3, label: "เหลือ 3 วัน" });
  assert.equal("color" in countdown, false);
});

test("keeps today, tomorrow, and overdue countdown labels", () => {
  const now = new Date(2026, 8, 11, 12);

  assert.equal(getJobCountdown("2026-09-11", now).label, "วันนี้");
  assert.equal(getJobCountdown("2026-09-12", now).label, "พรุ่งนี้");
  assert.equal(getJobCountdown("2026-09-09", now).label, "เลยกำหนด 2 วัน");
});

