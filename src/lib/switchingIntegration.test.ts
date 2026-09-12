import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const newPage = source("../app/new/page.tsx");
const detailPage = source("../app/job/[id]/page.tsx");
const createRoute = source("../app/api/jobs/route.ts");
const updateRoute = source("../app/api/jobs/[id]/route.ts");
const jobsRepo = source("./jobsRepo.ts");
const jobCard = source("../components/job/JobCard.tsx");
const calendarPage = source("../app/(app)/calendar/page.tsx");
const calendarRoute = source("../app/api/jobs/calendar/route.ts");
const migration = source("../../sql/025_outage_job_has_switching.sql");

test("new jobs require an explicit Switching choice in UI and API", () => {
  assert.match(newPage, /useState<boolean \| null>\(null\)/);
  assert.match(newPage, /hasSwitching === null/);
  assert.match(newPage, /switchingFirstOptionRef\.current\?\.focus\(\)/);
  assert.match(newPage, /has_switching: hasSwitching/);
  assert.match(createRoute, /typeof body\?\.has_switching !== "boolean"/);
  assert.match(createRoute, /has_switching: body\.has_switching/);
  assert.match(jobsRepo, /has_switching: boolean;/);
});

test("edit loads and persists Switching without losing a legacy null", () => {
  assert.match(detailPage, /setHasSwitching\(data\.has_switching \?\? null\)/);
  assert.match(detailPage, /has_switching: hasSwitching/);
  assert.match(updateRoute, /hasSwitching === null \|\| typeof hasSwitching === "boolean"/);
  assert.match(updateRoute, /data\.has_switching !== hasSwitching/);
  assert.match(jobsRepo, /result\.data\?\.has_switching !== patch\.has_switching/);
});

test("card and calendar show Switching only when it is true", () => {
  assert.match(jobCard, /job\.has_switching === true \? <SwitchingBadge/);
  assert.match(calendarRoute, /responsible_unit, has_switching,/);
  assert.match(calendarPage, /job\.has_switching === true/);
  assert.match(calendarPage, /switching_count/);
});

test("migration preserves legacy rows with a nullable boolean", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS has_switching boolean NULL/);
  assert.doesNotMatch(migration, /UPDATE|DROP TABLE|TRUNCATE|DELETE FROM/i);
});
