import test from "node:test";
import assert from "node:assert/strict";
import {
  getDocumentWorkflowAction,
  getDocumentWorkflowStage,
  getJobQueueState,
  getWaitingForTimeLabel,
  isJobActionableNow,
  isReadyForExecution
} from "./documentWorkflow.ts";

const documentReady = { doc_status: "GENERATED" };

test("case A follows every persisted document workflow stage", () => {
  assert.equal(getDocumentWorkflowStage({}), "DRAFT");
  assert.equal(getDocumentWorkflowStage(documentReady), "WAITING_DOCUMENT");
  assert.equal(
    getDocumentWorkflowStage({
      ...documentReady,
      document_received_at: "2026-08-20T02:00:00.000Z"
    }),
    "WAITING_DELIVERY"
  );
  assert.equal(
    getDocumentWorkflowStage({
      ...documentReady,
      document_received_at: "2026-08-20T02:00:00.000Z",
      document_delivered_at: "2026-08-20T03:00:00.000Z"
    }),
    "READY_FOR_NOTICE"
  );
  assert.equal(
    getDocumentWorkflowStage({ ...documentReady, social_status: "POSTED" }),
    "SOCIAL_POSTED"
  );
  assert.equal(
    getDocumentWorkflowStage({
      ...documentReady,
      notice_status: "SCHEDULED"
    }),
    "NOTICE_SCHEDULED"
  );
  assert.equal(
    getDocumentWorkflowStage({
      ...documentReady,
      notice_status: "COMPLETED",
      notice_completed_at: "2026-08-20T05:00:00.000Z"
    }),
    "READY_FOR_SOCIAL"
  );
});

test("cases B-D return the operational next action", () => {
  assert.equal(getDocumentWorkflowAction(documentReady), "RECEIVE_DOCUMENT");
  assert.equal(
    getDocumentWorkflowAction({
      ...documentReady,
      document_received_at: "2026-08-20T02:00:00.000Z"
    }),
    "DELIVER_DOCUMENT"
  );
  assert.equal(
    getDocumentWorkflowAction({
      ...documentReady,
      document_received_at: "2026-08-20T02:00:00.000Z",
      document_delivered_at: "2026-08-20T03:00:00.000Z"
    }),
    "SCHEDULE_NOTICE"
  );
  assert.equal(
    getDocumentWorkflowAction({
      ...documentReady,
      document_received_at: "2026-08-20T02:00:00.000Z",
      document_delivered_at: "2026-08-20T03:00:00.000Z",
      notice_status: "SCHEDULED"
    }),
    "COMPLETE_NOTICE"
  );
  assert.equal(
    getDocumentWorkflowAction({
      ...documentReady,
      document_received_at: "2026-08-20T02:00:00.000Z",
      document_delivered_at: "2026-08-20T03:00:00.000Z",
      notice_status: "COMPLETED",
      notice_completed_at: "2026-08-20T05:00:00.000Z"
    }),
    "POST_SOCIAL"
  );
});

test("case E keeps legacy Social and SENT rows at their completed stage", () => {
  assert.equal(
    getDocumentWorkflowStage({ doc_status: "GENERATED", social_status: "POSTED" }),
    "SOCIAL_POSTED"
  );
  assert.equal(
    getDocumentWorkflowStage({
      doc_status: "GENERATED",
      notice_status: "SENT"
    }),
    "READY_FOR_SOCIAL"
  );
});

test("a planned delivery date does not mark distribution as completed", () => {
  const job = {
    ...documentReady,
    document_received_at: "2026-08-20T02:00:00.000Z",
    document_delivered_at: "2026-08-20T03:00:00.000Z",
    notice_status: "SCHEDULED",
    notice_date: "2026-08-21"
  };

  assert.equal(getDocumentWorkflowStage(job), "NOTICE_SCHEDULED");
  assert.equal(getDocumentWorkflowAction(job), "COMPLETE_NOTICE");
});

test("ready for execution starts only after Social is completed and ends on close or rollback", () => {
  const awaitingSocial = {
    ...documentReady,
    notice_status: "COMPLETED",
    notice_completed_at: "2026-08-20T05:00:00.000Z",
    social_status: "PENDING_APPROVAL",
    is_closed: false
  };

  assert.equal(isReadyForExecution({ is_closed: false }), false);
  assert.equal(isReadyForExecution(awaitingSocial), false);
  assert.equal(isReadyForExecution({ ...awaitingSocial, social_status: "POSTED" }), true);
  assert.equal(isReadyForExecution({ ...awaitingSocial, social_posted_at: "2026-08-20T06:00:00.000Z" }), true);
  assert.equal(isReadyForExecution({ ...awaitingSocial, social_status: "POSTED", is_closed: true }), false);
  assert.equal(isReadyForExecution({ ...awaitingSocial, social_status: "DRAFT", social_posted_at: null }), false);
  assert.equal(isReadyForExecution({ social_status: "POSTED", is_closed: false }), true);
});

test("scheduled notice enters the action queue on its Bangkok due date and stays overdue", () => {
  const job = {
    ...documentReady,
    outage_date: "2026-10-12",
    notice_status: "SCHEDULED",
    notice_date: "2026-10-02",
    document_delivered_at: "2026-09-28T05:00:00Z"
  };

  assert.equal(isJobActionableNow(job, new Date("2026-09-29T12:00:00Z")), false);
  assert.equal(isJobActionableNow(job, new Date("2026-10-01T16:59:59Z")), false);
  assert.equal(isJobActionableNow(job, new Date("2026-10-01T17:00:00Z")), true);
  assert.equal(isJobActionableNow(job, new Date("2026-10-03T12:00:00Z")), true);
  assert.equal(getDocumentWorkflowAction(job), "COMPLETE_NOTICE");
  assert.equal(isJobActionableNow({ ...job, notice_status: "COMPLETED" }, new Date("2026-10-02T12:00:00Z")), false);
  assert.equal(isJobActionableNow({ ...job, notice_date: null }, new Date("2026-09-29T12:00:00Z")), true);
});

test("completed notice waits for the existing Social recommendation, then remains actionable", () => {
  const job = {
    ...documentReady,
    outage_date: "2026-10-12",
    notice_status: "COMPLETED",
    notice_completed_at: "2026-10-02T05:00:00Z",
    social_status: "DRAFT",
    is_closed: false
  };

  assert.equal(isJobActionableNow(job, new Date("2026-10-02T12:00:00Z")), false);
  assert.equal(isJobActionableNow(job, new Date("2026-10-04T16:59:59Z")), false);
  assert.equal(isJobActionableNow(job, new Date("2026-10-04T17:00:00Z")), true);
  assert.equal(isJobActionableNow(job, new Date("2026-10-06T12:00:00Z")), true);
  assert.equal(getDocumentWorkflowAction(job), "POST_SOCIAL");
  assert.equal(isJobActionableNow({ ...job, social_status: "POSTED" }), false);
  assert.equal(isReadyForExecution({ ...job, social_status: "POSTED" }), true);
  assert.equal(isJobActionableNow({ ...job, is_closed: true }), false);
});

test("document preparation remains actionable", () => {
  const received = "2026-09-28T05:00:00Z";
  const now = new Date("2026-09-29T12:00:00Z");
  assert.equal(isJobActionableNow({}, now), true);
  assert.equal(isJobActionableNow(documentReady, now), true);
  assert.equal(isJobActionableNow({ ...documentReady, document_received_at: received }, now), true);
  assert.equal(isJobActionableNow({ ...documentReady, document_received_at: received, document_delivered_at: received }, now), true);
});

test("queue resolver separates waiting notice, due and overdue notice", () => {
  const job = {
    outage_date: "2026-10-12",
    document_delivered_at: "2026-09-28T05:00:00Z",
    notice_status: "SCHEDULED",
    notice_date: "2026-10-02"
  };
  const waiting = getJobQueueState(job, new Date("2026-09-29T12:00:00Z"));
  assert.deepEqual(waiting, { kind: "WAITING_FOR_TIME", reason: "NOTICE", nextActionDate: "2026-10-02" });
  if (waiting.kind === "WAITING_FOR_TIME") {
    assert.match(getWaitingForTimeLabel(waiting), /รอแจกหนังสือ.*02 ต\.ค\. 69/);
  }
  assert.equal(getJobQueueState(job, new Date("2026-10-01T17:00:00Z")).kind, "ACTIONABLE_NOW");
  assert.equal(getJobQueueState(job, new Date("2026-10-03T12:00:00Z")).kind, "ACTIONABLE_NOW");
  assert.equal(getJobQueueState({ ...job, notice_date: null }, new Date("2026-09-29T12:00:00Z")).kind, "ACTIONABLE_NOW");
});

test("queue resolver separates waiting Social, due Social, ready and closed", () => {
  const job = {
    outage_date: "2026-10-12",
    notice_status: "COMPLETED",
    notice_completed_at: "2026-10-02T05:00:00Z",
    social_status: "DRAFT",
    is_closed: false
  };
  const waiting = getJobQueueState(job, new Date("2026-10-02T12:00:00Z"));
  assert.deepEqual(waiting, { kind: "WAITING_FOR_TIME", reason: "SOCIAL", nextActionDate: "2026-10-05" });
  if (waiting.kind === "WAITING_FOR_TIME") {
    assert.match(getWaitingForTimeLabel(waiting), /รอโพสต์ Social.*05 ต\.ค\. 69/);
  }
  assert.equal(getJobQueueState(job, new Date("2026-10-04T17:00:00Z")).kind, "ACTIONABLE_NOW");
  assert.equal(getJobQueueState(job, new Date("2026-10-06T12:00:00Z")).kind, "ACTIONABLE_NOW");
  assert.equal(getJobQueueState({ ...job, social_status: "POSTED" }).kind, "READY_FOR_OPERATION");
  assert.equal(getJobQueueState({ ...job, is_closed: true }).kind, "CLOSED");
  assert.equal(getJobQueueState({ notice_status: "COMPLETED", outage_date: null }).kind, "ACTIONABLE_NOW");
});
