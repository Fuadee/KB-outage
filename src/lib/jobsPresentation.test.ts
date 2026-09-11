import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const jobsPage = readFileSync(
  new URL("../app/(app)/jobs/page.tsx", import.meta.url),
  "utf8"
);
const jobCard = readFileSync(
  new URL("../components/job/JobCard.tsx", import.meta.url),
  "utf8"
);

test("jobs page no longer exposes legacy traffic-light filters", () => {
  assert.doesNotMatch(jobsPage, /label: "(?:เขียว|เหลือง|แดง)"/);
  assert.doesNotMatch(jobsPage, /getJobUrgency|FilterOption/);
});

test("active and closed workflow filters remain available", () => {
  assert.match(jobsPage, /label: "ดำเนินการ"/);
  assert.match(jobsPage, /label: "ปิดแล้ว"/);
});

test("job card is neutral while countdown and workflow remain visible", () => {
  assert.doesNotMatch(jobCard, /StatusBadge|UrgencyColor/);
  assert.doesNotMatch(jobCard, /\b(?:GREEN|YELLOW|RED)\b/);
  assert.match(jobCard, /countdown\.label/);
  assert.match(jobCard, /JobStatusStepper/);
});

test("social and distribution reminder semantics remain on the card", () => {
  assert.match(jobCard, /ประชาสัมพันธ์/);
  assert.match(jobCard, /แจกหนังสือแจ้งดับไฟ/);
  assert.match(jobCard, /DUE_TODAY/);
  assert.match(jobCard, /OVERDUE/);
});

