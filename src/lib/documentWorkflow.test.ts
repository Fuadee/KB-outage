import test from "node:test";
import assert from "node:assert/strict";
import {
  getDocumentWorkflowAction,
  getDocumentWorkflowStage
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
