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
    "READY_FOR_SOCIAL"
  );
  assert.equal(
    getDocumentWorkflowStage({ ...documentReady, social_status: "POSTED" }),
    "SOCIAL_POSTED"
  );
  assert.equal(
    getDocumentWorkflowStage({
      ...documentReady,
      social_status: "POSTED",
      notice_status: "SCHEDULED"
    }),
    "NOTICE_SCHEDULED"
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
    "POST_SOCIAL"
  );
});

test("case E keeps legacy Social and Notice rows at their completed stage", () => {
  assert.equal(
    getDocumentWorkflowStage({ doc_status: "GENERATED", social_status: "POSTED" }),
    "SOCIAL_POSTED"
  );
  assert.equal(
    getDocumentWorkflowStage({
      doc_status: "GENERATED",
      notice_status: "SCHEDULED"
    }),
    "NOTICE_SCHEDULED"
  );
});

