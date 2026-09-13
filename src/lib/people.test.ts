import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getNoticeDistributorDisplayName,
  getPersonReference,
  getWorkSupervisorDisplayName
} from "./people.ts";
import {
  findActivePersonForDepartment,
  normalizePersonId
} from "./peopleServer.ts";

const person = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  full_name: "สมชาย ใจดี",
  department: "แผนกปฏิบัติการ" as const,
  is_active: false
};

test("person relations support Supabase object and array shapes", () => {
  assert.equal(getPersonReference(person), person);
  assert.equal(getPersonReference([person]), person);
  assert.equal(getPersonReference([]), null);
});

test("current person relation takes precedence over the legacy supervisor snapshot", () => {
  assert.equal(
    getWorkSupervisorDisplayName({
      work_supervisor_person_id: person.id,
      work_supervisor_person: person,
      work_supervisor_name: "ชื่อเดิม"
    }),
    "สมชาย ใจดี"
  );
});

test("legacy names remain visible when old jobs have no person relation", () => {
  assert.equal(
    getWorkSupervisorDisplayName({ work_supervisor_name: "ผู้ควบคุมเดิม" }),
    "ผู้ควบคุมเดิม"
  );
  assert.equal(
    getNoticeDistributorDisplayName({ notice_by: "ผู้แจกเดิม" }),
    "ผู้แจกเดิม"
  );
});

test("an explicitly cleared person id ignores stale merged relation data", () => {
  assert.equal(
    getNoticeDistributorDisplayName({
      notice_by_person_id: null,
      notice_by_person: person,
      notice_by: null
    }),
    null
  );
});

test("person ids accept UUIDs and reject malformed values", () => {
  assert.equal(normalizePersonId(person.id), person.id);
  assert.equal(normalizePersonId(""), null);
  assert.equal(normalizePersonId(null), null);
  assert.equal(normalizePersonId("not-an-id"), undefined);
  assert.equal(normalizePersonId(123), undefined);
});

function peopleClient(record: typeof person | null): SupabaseClient {
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    async maybeSingle() {
      return { data: record, error: null };
    }
  };
  return { from: () => query } as unknown as SupabaseClient;
}

test("server selection accepts only active people in the requested department", async () => {
  const activePerson = { ...person, is_active: true };
  assert.equal(
    await findActivePersonForDepartment(
      peopleClient(activePerson),
      activePerson.id,
      "แผนกปฏิบัติการ"
    ),
    activePerson
  );
  assert.equal(
    await findActivePersonForDepartment(
      peopleClient(activePerson),
      activePerson.id,
      "แผนกก่อสร้าง"
    ),
    null
  );
  assert.equal(
    await findActivePersonForDepartment(
      peopleClient(person),
      person.id,
      "แผนกปฏิบัติการ"
    ),
    null
  );
});
