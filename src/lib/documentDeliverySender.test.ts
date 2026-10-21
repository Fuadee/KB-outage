import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDocumentDeliverySender } from "./documentDeliverySender.ts";
import type { PersonReference } from "./people.ts";

const id = "123e4567-e89b-42d3-a456-426614174000";
const otherId = "123e4567-e89b-42d3-a456-426614174001";
const legacy = {
  document_delivered_at: "2026-10-20T03:00:00Z",
  document_delivered_by: "ชื่อเดิมที่ไม่ได้จับคู่"
};
const recorded = {
  ...legacy,
  document_delivered_by_person_id: id,
  document_delivered_by_department: "แผนกปฏิบัติการ"
};
function client(person: PersonReference | null) {
  const query = {
    select() { return query; },
    eq(column: string, value: string) {
      assert.equal(column, "id");
      assert.ok([id, otherId].includes(value));
      return query;
    },
    async maybeSingle() { return { data: person, error: null }; }
  };
  return { from(table: string) {
    assert.equal(table, "people");
    return query;
  } } as unknown as SupabaseClient;
}
const noLookup = {} as SupabaseClient;
const knownFields = {
  document_delivery_sender_status: "PERSON",
  document_delivery_unknown_reason: null,
  document_delivery_confirmed_at: null
};

test("new senders can be selected from every active department", async () => {
  for (const department of ["แผนกปฏิบัติการ", "แผนกก่อสร้าง", "กฟส.อ่าวนาง"] as const) {
    const person = { id, full_name: "ผู้ส่ง จากต่างสังกัด", department, is_active: true };
    assert.deepEqual(
      await resolveDocumentDeliverySender(client(person), { document_delivered_by: null }, { person_id: id }),
      { ...knownFields, document_delivered_by_person_id: id, document_delivered_by: person.full_name, document_delivered_by_department: department }
    );
  }
});

test("inactive and missing people cannot be newly selected", async () => {
  for (const person of [null, { id, full_name: "ปิดใช้งาน", department: "แผนกก่อสร้าง" as const, is_active: false }]) {
    assert.equal(await resolveDocumentDeliverySender(client(person), legacy, { person_id: id }), null);
  }
});

test("free text, missing selection and malformed ids cannot create delivery senders", async () => {
  for (const person_id of [undefined, null, "", "ชื่อที่พิมพ์เอง", 123]) {
    assert.equal(await resolveDocumentDeliverySender(noLookup, { document_delivered_by: null }, { person_id, preserve_existing_sender: true }), null);
  }
});

test("legacy text can be explicitly preserved, with no automatic matching or lookup", async () => {
  assert.equal(await resolveDocumentDeliverySender(noLookup, legacy, {}), null);
  assert.deepEqual(await resolveDocumentDeliverySender(noLookup, legacy, { preserve_existing_sender: true }), {
    ...knownFields, document_delivery_sender_status: null,
    document_delivered_by_person_id: null,
    document_delivered_by: legacy.document_delivered_by,
    document_delivered_by_department: null
  });
});

test("same-person resaves preserve name and department snapshots without consulting changed or inactive master data", async () => {
  assert.deepEqual(await resolveDocumentDeliverySender(noLookup, recorded, { person_id: id }), {
    ...knownFields,
    document_delivered_by_person_id: id,
    document_delivered_by: recorded.document_delivered_by,
    document_delivered_by_department: recorded.document_delivered_by_department
  });
});

test("UNKNOWN requires a reason and explicit confirmation, and never retains a person's identity", async () => {
  const input = { sender_status: "UNKNOWN", unknown_reason: "ไม่อยู่ในเหตุการณ์ แต่ได้รับเอกสารแล้ว", delivery_confirmed: true };
  const result = await resolveDocumentDeliverySender(noLookup, recorded, input);
  assert.equal(result?.document_delivery_sender_status, "UNKNOWN");
  assert.equal(result?.document_delivered_by_person_id, null);
  assert.equal(result?.document_delivered_by, null);
  assert.equal(result?.document_delivered_by_department, null);
  assert.equal(result?.document_delivery_unknown_reason, input.unknown_reason);
  assert.ok(result?.document_delivery_confirmed_at);
  for (const invalid of [
    { unknown_reason: " " }, { unknown_reason: "x".repeat(1001) },
    { delivery_confirmed: false }, { delivery_confirmed: "true" },
    { person_id: id }, { preserve_existing_sender: true }, { sender_status: "FAKE" }
  ]) {
    assert.equal(await resolveDocumentDeliverySender(noLookup, recorded, { ...input, ...invalid }), null);
  }
});

test("UNKNOWN can become an active person with reason and confirmation cleared", async () => {
  const person = { id, full_name: "ผู้ส่งจริง", department: "กฟส.อ่าวนาง" as const, is_active: true };
  const job = { ...legacy, document_delivered_by: null, document_delivery_sender_status: "UNKNOWN" as const };
  assert.equal(await resolveDocumentDeliverySender(noLookup, job, { preserve_existing_sender: true }), null);
  const result = await resolveDocumentDeliverySender(client(person), job, { person_id: id, sender_status: "PERSON" });
  assert.equal(result?.document_delivery_sender_status, "PERSON");
  assert.equal(result?.document_delivery_unknown_reason, null);
  assert.equal(result?.document_delivery_confirmed_at, null);
  assert.equal(result?.document_delivered_by, person.full_name);
});

test("a linked sender cannot be cleared by requesting legacy preservation", async () => {
  assert.equal(await resolveDocumentDeliverySender(noLookup, recorded, { preserve_existing_sender: true }), null);
});

test("legacy or existing senders can be explicitly replaced by an active person", async () => {
  const person = { id: otherId, full_name: "ผู้ส่งคนใหม่", department: "กฟส.อ่าวนาง" as const, is_active: true };
  for (const job of [legacy, recorded]) {
    const result = await resolveDocumentDeliverySender(client(person), job, { person_id: otherId });
    assert.equal(result?.document_delivered_by_person_id, otherId);
    assert.equal(result?.document_delivered_by, person.full_name);
    assert.equal(result?.document_delivered_by_department, person.department);
  }
});
