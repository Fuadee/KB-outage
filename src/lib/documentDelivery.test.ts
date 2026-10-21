import assert from "node:assert/strict";
import test from "node:test";
import { getDocumentDeliverySenderLabel } from "./documentDelivery.ts";
import { getDocumentWorkflowStage } from "./documentWorkflow.ts";

test("UNKNOWN stays distinct from an unsent document, and does not itself advance workflow", () => {
  const job = { doc_status: "GENERATED", document_received_at: "2026-10-20T01:00:00Z", document_delivery_sender_status: "UNKNOWN" as const };
  assert.equal(getDocumentDeliverySenderLabel(job), "ยังไม่ได้ส่งเอกสาร");
  assert.equal(getDocumentWorkflowStage(job), "WAITING_DELIVERY");
  const delivered = { ...job, document_delivered_at: "2026-10-20T02:00:00Z" };
  assert.equal(getDocumentDeliverySenderLabel(delivered), "ไม่ทราบชื่อผู้ส่ง");
  assert.equal(getDocumentWorkflowStage(delivered), "READY_FOR_NOTICE");
});

test("normal and legacy display still use recorded names and departments", () => {
  const job = { document_delivered_at: "2026-10-20T02:00:00Z", document_delivered_by: "ชื่อเดิม" };
  assert.equal(getDocumentDeliverySenderLabel(job), "ชื่อเดิม");
  assert.equal(getDocumentDeliverySenderLabel({ ...job, document_delivery_sender_status: "PERSON", document_delivered_by_department: "แผนกก่อสร้าง" }), "ชื่อเดิม · แผนกก่อสร้าง");
});
