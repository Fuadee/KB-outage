import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getAvailableWorkflowRollbackOptions,
  getWorkflowActualStep
} from "./workflowRollback.ts";

const sentJob = {
  doc_status: "GENERATED",
  document_received_at: "2026-09-10T01:00:00.000Z",
  document_delivered_at: "2026-09-10T02:00:00.000Z"
};

test("case A: completed delivery can roll back to document sent", () => {
  const job = {
    ...sentJob,
    notice_status: "COMPLETED",
    notice_completed_at: "2026-09-11T03:00:00.000Z"
  };
  assert.equal(getWorkflowActualStep(job), "DELIVERY_COMPLETED");
  assert.ok(
    getAvailableWorkflowRollbackOptions(job).some(
      (option) => option.target === "DOCUMENT_SENT"
    )
  );
});

test("case B: a closed job exposes every valid earlier rollback target", () => {
  const targets = getAvailableWorkflowRollbackOptions({
    ...sentJob,
    notice_status: "COMPLETED",
    notice_completed_at: "2026-09-11T03:00:00.000Z",
    social_status: "POSTED",
    social_posted_at: "2026-09-11T04:00:00.000Z",
    is_closed: true
  }).map((option) => option.target);

  assert.deepEqual(targets, [
    "DOCUMENT_CREATED",
    "DOCUMENT_RECEIVED",
    "DOCUMENT_SENT",
    "DELIVERY_COMPLETED",
    "SOCIAL_POSTED"
  ]);
});

test("case C: a scheduled date remains at document sent, not delivery completed", () => {
  const job = {
    ...sentJob,
    notice_status: "SCHEDULED",
    notice_date: "2026-09-11"
  };
  assert.equal(getWorkflowActualStep(job), "DOCUMENT_SENT");
  assert.equal(
    getAvailableWorkflowRollbackOptions(job).some(
      (option) => option.target === "DOCUMENT_SENT"
    ),
    false
  );
});

test("case D: posted Social can roll back to completed delivery", () => {
  const job = {
    ...sentJob,
    notice_status: "COMPLETED",
    notice_completed_at: "2026-09-11T03:00:00.000Z",
    social_status: "POSTED"
  };
  assert.equal(getWorkflowActualStep(job), "SOCIAL_POSTED");
  assert.ok(
    getAvailableWorkflowRollbackOptions(job).some(
      (option) => option.target === "DELIVERY_COMPLETED"
    )
  );
});

test("rollback is a single RPC and SQL clears downstream fields before audit insert", () => {
  const route = readFileSync(
    new URL("../app/api/jobs/[id]/workflow-rollback/route.ts", import.meta.url),
    "utf8"
  );
  const migration = readFileSync(
    new URL("../../sql/023_job_workflow_rollback.sql", import.meta.url),
    "utf8"
  );

  assert.equal(route.match(/\.rpc\("rollback_outage_job_workflow"/g)?.length, 1);
  assert.doesNotMatch(route, /\.from\("outage_jobs"\)\s*\.update/);
  assert.match(migration, /notice_completed_at = case when v_target_rank < 4 then null/);
  assert.match(migration, /social_posted_at = case when v_target_rank < 5 then null/);
  assert.match(migration, /is_closed = false/);
  assert.match(migration, /insert into public\.outage_job_workflow_audit/);
});

