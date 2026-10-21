import assert from "node:assert/strict";
import test from "node:test";
import { getDocumentReceiptDetail } from "./documentReceipt.ts";

test("new receipts display filing confirmation and timestamp without an empty receiver placeholder", () => {
  const result = getDocumentReceiptDetail({ document_received_at: "2026-10-21T02:30:00Z", document_received_by: null });
  assert.match(result, /^รับเอกสารและจัดเข้าแฟ้มแล้ว · /);
  assert.match(result, /2569/);
  assert.doesNotMatch(result, /ไม่ระบุ|ผู้รับ| · -/);
});

test("legacy receiver names remain visible without relabelling their historical receipt as filing confirmation", () => {
  const result = getDocumentReceiptDetail({ document_received_at: "2026-10-20T01:00:00Z", document_received_by: "ผู้รับเดิม" });
  assert.match(result, /^รับเอกสารแล้ว · /);
  assert.match(result, /ผู้รับเดิม$/);
  assert.doesNotMatch(result, /จัดเข้าแฟ้ม/);
  assert.equal(getDocumentReceiptDetail({}), "รอรับเอกสารฉบับจริง");
});
