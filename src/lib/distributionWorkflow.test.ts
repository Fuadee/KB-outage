import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getDistributionWorkflow,
  isDirectDistributionRoute
} from "./distributionWorkflow.ts";

test("operations uses shift 1 scheduling and reminder rules", () => {
  const flow = getDistributionWorkflow({
    responsible_unit: "แผนกปฏิบัติการ"
  });

  assert.equal(flow.route, "OPERATIONS");
  assert.equal(flow.assignmentLabel, "กะ 1");
  assert.equal(flow.requiresSchedule, true);
  assert.equal(flow.reminderEligible, true);
  assert.equal(flow.actionLabel, "แจ้งหนังสือดับไฟ");
});

test("construction and Ao Nang use direct distribution without reminders", () => {
  const construction = getDistributionWorkflow({
    responsible_unit: "แผนกก่อสร้าง"
  });
  const aoNang = getDistributionWorkflow({ responsible_unit: "กฟส.อ่าวนาง" });

  assert.equal(construction.actionLabel, "แจ้งก่อสร้างแจกหนังสือ");
  assert.equal(construction.requiresSchedule, false);
  assert.equal(construction.reminderEligible, false);
  assert.equal(aoNang.actionLabel, "แจ้งอ่าวนางแจกหนังสือ");
  assert.equal(aoNang.assignmentLabel, "อ่าวนาง");
  assert.equal(aoNang.reminderEligible, false);
  assert.equal(isDirectDistributionRoute(construction.route), true);
  assert.equal(isDirectDistributionRoute(aoNang.route), true);
});

test("changing department derives the new route without deleting history", () => {
  const historicalSchedule = {
    notice_date: "2026-09-12",
    notice_status: "SCHEDULED"
  };

  const construction = getDistributionWorkflow({
    ...historicalSchedule,
    responsible_unit: "แผนกก่อสร้าง"
  });
  const operations = getDistributionWorkflow({
    responsible_unit: "แผนกปฏิบัติการ"
  });

  assert.equal(construction.route, "DIRECT_CONSTRUCTION");
  assert.equal(construction.reminderEligible, false);
  assert.equal(construction.actionLabel, "แจ้งก่อสร้างแจกหนังสือ");
  assert.equal(operations.route, "OPERATIONS");
  assert.equal(operations.requiresSchedule, true);
});

test("completion is terminal even after the department changes", () => {
  const flow = getDistributionWorkflow({
    responsible_unit: "แผนกก่อสร้าง",
    notice_date: "2026-09-12",
    notice_status: "COMPLETED",
    notice_completed_at: "2026-09-12T03:00:00.000Z"
  });

  assert.equal(flow.completed, true);
  assert.equal(flow.requiresSchedule, false);
  assert.equal(flow.reminderEligible, false);
  assert.equal(flow.actionLabel, "ดู / แก้ไขผลการแจกหนังสือ");
});

test("legacy jobs without a recognized unit fail closed", () => {
  const flow = getDistributionWorkflow({
    responsible_unit: null,
    notice_date: "2026-09-12"
  });

  assert.equal(flow.route, "UNASSIGNED");
  assert.equal(flow.assignmentLabel, null);
  assert.equal(flow.reminderEligible, false);
});

test("UI and server boundaries reuse the shared resolver", () => {
  const jobsPage = readFileSync(
    new URL("../app/(app)/jobs/page.tsx", import.meta.url),
    "utf8"
  );
  const modal = readFileSync(
    new URL("../components/NoticeScheduleModal.tsx", import.meta.url),
    "utf8"
  );
  const card = readFileSync(
    new URL("../components/job/JobCard.tsx", import.meta.url),
    "utf8"
  );
  const scheduleRoute = readFileSync(
    new URL("../app/api/jobs/notice-schedule/route.ts", import.meta.url),
    "utf8"
  );
  const completionRoute = readFileSync(
    new URL("../app/api/jobs/[id]/notice-completion/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(jobsPage, /getDistributionWorkflow\(job\)/);
  assert.match(jobsPage, /distributionWorkflow\.actionLabel/);
  assert.match(modal, /getDistributionWorkflow\(job\)/);
  assert.match(modal, /isOperationsFlow && !isCompleted/);
  assert.match(card, /distributionWorkflow\.route === "DIRECT_CONSTRUCTION"/);
  assert.match(card, /distributionWorkflow\.route === "OPERATIONS"/);
  assert.match(scheduleRoute, /distributionWorkflow\.route !== "OPERATIONS"/);
  assert.match(completionRoute, /isDirectDistributionRoute/);
});
