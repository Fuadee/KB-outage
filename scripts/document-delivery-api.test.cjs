const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const id = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";

// Exercise the real route and sender resolver with an isolated database double.
function harness() {
  const job = {
    id, responsible_unit: "แผนกปฏิบัติการ", doc_status: "GENERATED",
    document_received_at: "2026-10-20T01:00:00Z", document_received_by: "ผู้รับเดิม",
    document_delivered_at: null, document_delivered_by: null,
    document_delivered_by_person_id: null, document_delivered_by_department: null,
    document_delivery_note: null, is_closed: false
  };
  const person = { id: personId, full_name: "ผู้ส่ง ต่างสังกัด", department: "แผนกก่อสร้าง", is_active: true };
  const history = [];
  let writes = 0;
  let writeError = false;
  let beforeReceiveWrite = null;
  const client = {
    from(table) {
      let patch;
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, value) {
          if (key === "is_closed") { assert.equal(value, false); filters.push(row => row.is_closed === false); }
          else { assert.equal(key, table === "outage_job_document_delivery_audit" ? "job_id" : "id"); assert.equal(value, table === "people" ? personId : id); }
          return query;
        },
        is(key, value) { assert.equal(key, "document_received_at"); assert.equal(value, null); filters.push(row => row.document_received_at == null); return query; },
        or(value) { assert.equal(value, "doc_status.eq.GENERATED,doc_generated_at.not.is.null"); filters.push(row => row.doc_status === "GENERATED" || row.doc_generated_at); return query; },
        order() { return query; }, limit() { return query; },
        then(resolve, reject) { return Promise.resolve({ data: history, error: null }).then(resolve, reject); },
        update(value) { patch = value; return query; },
        async single() {
          if (patch) {
            if (writeError) return { data: null, error: { message: "Simulated write failure" } };
            Object.assign(job, patch); writes++;
          }
          return { data: { ...job }, error: null };
        },
        async maybeSingle() {
          if (table === "people") return { data: { ...person }, error: null };
          if (beforeReceiveWrite) { const hook = beforeReceiveWrite; beforeReceiveWrite = null; hook(); }
          if (!filters.every(filter => filter(job))) return { data: null, error: null };
          return query.single();
        }
      };
      return query;
    }
  };
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {};
    cache.set(absolute, exports);
    const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    vm.runInNewContext(code, {
      exports, Request, Response, Date, console,
      process: { env: { SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test" } },
      require(name) {
        if (name === "@supabase/supabase-js") return { createClient: () => client };
        if (name === "@/lib/serverTls") return { ensureSystemCertificateAuthorities() {} };
        if (name.startsWith("@/") || name.startsWith(".")) {
          let target = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
          if (!target.endsWith(".ts")) target += ".ts";
          return load(target);
        }
        return require(name);
      }
    }, { filename: absolute });
    return exports;
  }
  const route = load("src/app/api/jobs/[id]/document-workflow/route.ts");
  return {
    job, person, history, get writes() { return writes; },
    failWrites() { writeError = true; },
    beforeReceiveWrite(hook) { beforeReceiveWrite = hook; },
    getHistory() { return route.GET(new Request("http://localhost/workflow"), { params: { id } }); },
    async patch(body) {
      const response = await route.PATCH(new Request("http://localhost/workflow", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deliver", occurred_at: "2026-10-20T03:00:00Z", ...body })
      }), { params: { id } });
      return { status: response.status, body: await response.json() };
    }
  };
}

test("PATCH saves a cross-department person id and returns persisted snapshots", async () => {
  const h = harness();
  const result = await h.patch({ person_id: personId, operator: "untrusted text", note: "ทดสอบ" });
  assert.equal(result.status, 200);
  assert.equal(result.body.job.document_delivered_by_person_id, personId);
  assert.equal(result.body.job.document_delivered_by, h.person.full_name);
  assert.equal(result.body.job.document_delivered_by_department, "แผนกก่อสร้าง");
  assert.equal(h.job.document_delivery_note, "ทดสอบ");
  h.person.full_name = "ชื่อใหม่";
  h.person.department = "กฟส.อ่าวนาง";
  h.person.is_active = false;
  const resaved = await h.patch({ person_id: personId });
  assert.equal(resaved.status, 200);
  assert.equal(resaved.body.job.document_delivered_by, "ผู้ส่ง ต่างสังกัด");
  assert.equal(resaved.body.job.document_delivered_by_department, "แผนกก่อสร้าง");
  assert.equal(h.writes, 2);
});

test("PATCH UNKNOWN requires explicit confirmation and reason, has no fake identity, and can be corrected", async () => {
  const h = harness();
  await h.patch({ person_id: personId });
  const unknown = { sender_status: "UNKNOWN", unknown_reason: "เลือกคนผิด ไม่ทราบผู้ส่งจริง", delivery_confirmed: true };
  for (const invalid of [
    { unknown_reason: " " }, { delivery_confirmed: false }, { delivery_confirmed: "true" },
    { person_id: personId }, { unknown_reason: "x".repeat(1001) },
    { occurred_at: "2099-01-01T00:00:00Z" }
  ]) assert.equal((await h.patch({ ...unknown, ...invalid })).status, 400);
  assert.equal(h.writes, 1);
  const result = await h.patch(unknown);
  assert.equal(result.status, 200);
  assert.equal(result.body.job.document_delivery_sender_status, "UNKNOWN");
  assert.equal(result.body.job.document_delivered_by, null);
  assert.equal(result.body.job.document_delivered_by_person_id, null);
  assert.equal(result.body.job.document_delivered_by_department, null);
  assert.equal(result.body.job.document_delivery_unknown_reason, unknown.unknown_reason);
  assert.ok(result.body.job.document_delivery_confirmed_at);
  assert.ok(result.body.job.document_delivered_at);
  assert.equal((await h.patch({ preserve_existing_sender: true })).status, 400);
  assert.equal((await h.patch({ sender_status: "PERSON", person_id: personId })).status, 200);
  assert.equal(h.job.document_delivery_sender_status, "PERSON");
  assert.equal(h.job.document_delivery_unknown_reason, null);
  assert.equal(h.job.document_delivery_confirmed_at, null);
});

test("UNKNOWN cannot skip document receipt or update closed jobs", async () => {
  const h = harness();
  const unknown = { sender_status: "UNKNOWN", unknown_reason: "ไม่ทราบ", delivery_confirmed: true };
  h.job.document_received_at = null;
  assert.equal((await h.patch(unknown)).status, 409);
  h.job.is_closed = true;
  assert.equal((await h.patch(unknown)).status, 409);
  assert.equal(h.writes, 0);
});

test("GET returns the database's before/after history with timestamps and disables caching", async () => {
  const h = harness();
  h.history.push({ id: "audit", created_at: "2026-10-20T03:00:00Z", before_state: { document_delivered_by: "ชื่อผิด" }, after_state: { document_delivery_sender_status: "UNKNOWN" } });
  const response = await h.getHistory();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual((await response.json()).history, h.history);
});

test("PATCH rejects free text and inactive selections without writing", async () => {
  const h = harness();
  assert.equal((await h.patch({ operator: "พิมพ์ชื่อเอง" })).status, 400);
  h.person.is_active = false;
  assert.equal((await h.patch({ person_id: personId })).status, 400);
  assert.equal(h.writes, 0);
});

test("PATCH preserves legacy text on edit and permits explicit conversion", async () => {
  const h = harness();
  Object.assign(h.job, { document_delivered_at: "2026-10-20T02:00:00Z", document_delivered_by: "ผู้ส่งเดิม" });
  assert.equal((await h.patch({ preserve_existing_sender: true })).status, 200);
  assert.equal(h.job.document_delivered_by, "ผู้ส่งเดิม");
  assert.equal(h.job.document_delivered_by_person_id, null);
  assert.equal((await h.patch({ person_id: personId })).status, 200);
  assert.equal(h.job.document_delivered_by_person_id, personId);
});

test("PATCH keeps receive, chronology and closed-job workflow rules", async () => {
  const h = harness();
  assert.equal((await h.patch({ action: "receive", operator: "ผู้รับข้อความเดิม" })).status, 200);
  assert.equal(h.job.document_received_by, "ผู้รับเดิม");
  assert.equal((await h.patch({ person_id: personId, occurred_at: "2026-10-20T00:00:00Z" })).status, 400);
  h.job.document_received_at = null;
  assert.equal((await h.patch({ person_id: personId })).status, 409);
  h.job.is_closed = true;
  assert.equal((await h.patch({ person_id: personId })).status, 409);
  assert.equal(h.writes, 0);
});

test("receipt uses server time, ignores client name/time, and unlocks delivery without a receiver name", async () => {
  const h = harness();
  h.job.document_received_at = null;
  h.job.document_received_by = null;
  const before = Date.now();
  const result = await h.patch({ action: "receive", occurred_at: "2099-01-01T00:00:00Z", operator: "ชื่อที่พิมพ์เอง" });
  assert.equal(result.status, 200);
  const timestamp = Date.parse(result.body.job.document_received_at);
  assert.ok(timestamp >= before && timestamp <= Date.now());
  assert.equal(h.job.document_received_by, null);
  assert.equal((await h.patch({ person_id: personId, occurred_at: h.job.document_received_at })).status, 200);
});

test("concurrent receipt confirmations and retries only write once and preserve the original time", async () => {
  const h = harness();
  h.job.document_received_at = null;
  h.job.document_received_by = null;
  const results = await Promise.all([h.patch({ action: "receive" }), h.patch({ action: "receive" })]);
  assert.equal(results[0].status, 200);
  assert.equal(results[1].status, 200);
  assert.equal(results[0].body.job.document_received_at, results[1].body.job.document_received_at);
  assert.equal(h.writes, 1);
  const timestamp = h.job.document_received_at;
  assert.equal((await h.patch({ action: "receive" })).body.job.document_received_at, timestamp);
  assert.equal(h.writes, 1);
});

test("receipt fails without changing state when saving fails or a concurrent close wins", async () => {
  const h = harness();
  h.job.document_received_at = null;
  h.failWrites();
  assert.equal((await h.patch({ action: "receive" })).status, 500);
  assert.equal(h.job.document_received_at, null);
  const closed = harness();
  closed.job.document_received_at = null;
  closed.beforeReceiveWrite(() => { closed.job.is_closed = true; });
  assert.equal((await closed.patch({ action: "receive" })).status, 409);
  assert.equal(closed.job.document_received_at, null);
  assert.equal(closed.writes, 0);
});

test("receipt requires a generated document and preserves existing legacy data on retry", async () => {
  const h = harness();
  const original = { ...h.job };
  assert.equal((await h.patch({ action: "receive" })).status, 200);
  assert.deepEqual(h.job, original);
  assert.equal(h.writes, 0);
  h.job.document_received_at = null;
  h.job.doc_status = "PENDING";
  assert.equal((await h.patch({ action: "receive" })).status, 409);
  assert.equal(h.writes, 0);
});
