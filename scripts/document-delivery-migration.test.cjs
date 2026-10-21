// Isolated PostgreSQL (PGlite). Install test runtime without changing app dependencies:
// npm install --prefix .tmp/delivery-sql-tests --no-save --no-package-lock @electric-sql/pglite
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const { PGlite } = require(path.join(root, ".tmp/delivery-sql-tests/node_modules/@electric-sql/pglite"));
const migration = name => fs.readFileSync(path.join(root, "sql", name), "utf8");
const id = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";
const next = migration("032_document_delivery_unknown_audit.sql");

for (const has031 of [false, true]) {
  test(`032 preserves legacy data and audits transitions atomically, 031=${has031}`, async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role;
        create schema auth; create table auth.users(id uuid primary key);`);
      for (const file of ["001_init.sql", "002_nakhon_and_doc.sql", "003_doc_fields.sql", "004_social_post.sql", "005_notice_schedule.sql", "006_close_jobs.sql", "018_document_workflow.sql", "021_outage_job_responsible_unit.sql", "023_job_workflow_rollback.sql", "026_notice_completion_provenance.sql", "027_outage_job_work_supervisor_name.sql", "028_people_master.sql"]) {
        await db.exec(migration(file));
      }
      if (has031) await db.exec(migration("031_document_delivery_person.sql"));
      await db.query(`insert into public.people(id, full_name, department) values ($1, 'ชื่อที่เคยเลือกผิด', 'แผนกก่อสร้าง')`, [personId]);
      await db.query(`insert into public.outage_jobs(id, outage_date, equipment_code, doc_status, document_received_at, document_received_by, document_delivered_at, document_delivered_by)
        values ($1, '2026-10-21', 'TEST', 'GENERATED', '2026-10-20T01:00:00Z', 'ผู้รับเดิม', '2026-10-20T02:00:00Z', 'ผู้ส่งข้อความเดิม')`, [id]);
      const before = (await db.query(`select * from public.outage_jobs where id=$1`, [id])).rows[0];
      await db.exec(next);
      await db.exec(next); // Rerunning must not duplicate, overwrite or backfill history.
      const after = (await db.query(`select * from public.outage_jobs where id=$1`, [id])).rows[0];
      for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key]);
      assert.equal(after.document_delivery_sender_status, null);
      assert.equal((await db.query(`select * from public.outage_job_document_delivery_audit`)).rows.length, 0);

      await db.query(`update public.outage_jobs set document_delivery_sender_status='PERSON', document_delivered_by_person_id=$2,
        document_delivered_by='ชื่อที่เคยเลือกผิด', document_delivered_by_department='แผนกก่อสร้าง' where id=$1`, [id, personId]);
      await db.query(`update public.outage_jobs set document_delivery_sender_status='UNKNOWN',
        document_delivered_by_person_id=null, document_delivered_by=null, document_delivered_by_department=null,
        document_delivery_unknown_reason='พบภายหลังว่าเลือกชื่อผิด ไม่ทราบผู้ส่งจริง', document_delivery_confirmed_at=clock_timestamp() where id=$1`, [id]);
      const audits = (await db.query(`select * from public.outage_job_document_delivery_audit order by created_at`)).rows;
      assert.equal(audits.length, 2);
      assert.equal(audits[1].before_state.document_delivered_by, "ชื่อที่เคยเลือกผิด");
      assert.equal(audits[1].after_state.document_delivery_sender_status, "UNKNOWN");
      assert.equal(audits[1].after_state.document_delivered_by, null);
      assert.equal(audits[1].actor_authenticated, false);
      assert.ok(audits[1].created_at);
      assert.equal((await db.query(`select document_delivered_at is not null as delivered from public.outage_jobs where id=$1`, [id])).rows[0].delivered, true);

      for (const invalid of [
        "document_delivery_unknown_reason=''", "document_delivery_confirmed_at=null",
        "document_delivered_by='ไม่ทราบชื่อผู้ส่ง'", `document_delivered_by_person_id='${personId}'`,
        "document_delivered_at=clock_timestamp()+interval '1 day'", "document_received_at=null"
      ]) {
        await assert.rejects(db.query(`update public.outage_jobs set ${invalid} where id=$1`, [id]), error => error.code === "23514");
      }
      // Correction to the actual person clears unknown-only fields; prior reason remains in audit.
      await db.query(`update public.outage_jobs set document_delivery_sender_status='PERSON', document_delivered_by_person_id=$2,
        document_delivered_by='ผู้ส่งจริง', document_delivered_by_department='แผนกก่อสร้าง',
        document_delivery_unknown_reason=null, document_delivery_confirmed_at=null where id=$1`, [id, personId]);
      const correction = (await db.query(`select * from public.outage_job_document_delivery_audit order by created_at desc limit 1`)).rows[0];
      assert.equal(correction.before_state.document_delivery_sender_status, "UNKNOWN");
      assert.equal(correction.after_state.document_delivered_by, "ผู้ส่งจริง");
      // An unchanged resave must not add a history entry just because updated_at changed.
      await db.query(`update public.outage_jobs set document_delivered_by=document_delivered_by where id=$1`, [id]);
      assert.equal((await db.query(`select * from public.outage_job_document_delivery_audit`)).rows.length, 3);

      // Snapshot changes in the master list never rewrite recorded names or audit entries.
      await db.query(`update public.people set full_name='ชื่อใหม่', is_active=false where id=$1`, [personId]);
      assert.equal((await db.query(`select document_delivered_by from public.outage_jobs where id=$1`, [id])).rows[0].document_delivered_by, "ผู้ส่งจริง");
      // Existing rollback function, with or without 031, clears all sender metadata and is audited.
      await db.query(`select public.rollback_outage_job_workflow($1, 'DOCUMENT_RECEIVED', 'ทดสอบย้อน')`, [id]);
      const reset = (await db.query(`select * from public.outage_jobs where id=$1`, [id])).rows[0];
      for (const key of ["document_delivered_at", "document_delivered_by", "document_delivered_by_person_id", "document_delivered_by_department", "document_delivery_sender_status", "document_delivery_unknown_reason", "document_delivery_confirmed_at"]) assert.equal(reset[key], null);
      const resetAudit = (await db.query(`select * from public.outage_job_document_delivery_audit order by created_at desc limit 1`)).rows[0];
      assert.equal(resetAudit.before_state.document_delivered_by, "ผู้ส่งจริง");
      assert.equal(resetAudit.after_state.document_delivered_at, null);

      await db.query(`update public.outage_jobs set document_delivered_at='2026-10-20T03:00:00Z',
        document_delivery_sender_status='UNKNOWN', document_delivery_unknown_reason='ไม่ทราบผู้ส่ง',
        document_delivery_confirmed_at=clock_timestamp() where id=$1`, [id]);
      await db.query(`select public.rollback_outage_job_workflow($1, 'DOCUMENT_RECEIVED', 'ทดสอบย้อน UNKNOWN')`, [id]);
      const unknownReset = (await db.query(`select * from public.outage_jobs where id=$1`, [id])).rows[0];
      for (const key of ["document_delivered_at", "document_delivery_sender_status", "document_delivery_unknown_reason", "document_delivery_confirmed_at"]) assert.equal(unknownReset[key], null);
      const unknownAudit = (await db.query(`select * from public.outage_job_document_delivery_audit order by created_at desc limit 1`)).rows[0];
      assert.equal(unknownAudit.before_state.document_delivery_unknown_reason, "ไม่ทราบผู้ส่ง");
      assert.equal(unknownAudit.after_state.document_delivery_sender_status, null);
      // NULL status is reserved for legacy records, and cannot carry UNKNOWN fields.
      await assert.rejects(db.query(`update public.outage_jobs set document_delivery_unknown_reason='ซ่อนเหตุผลในข้อมูลเก่า' where id=$1`, [id]), error => error.code === "23514");

      // The existing rollback audit preserves legacy receipt attribution.
      await db.query(`select public.rollback_outage_job_workflow($1, 'DOCUMENT_CREATED', 'ยืนยันรับผิด')`, [id]);
      const receiptAudit = (await db.query(`select * from public.outage_job_workflow_audit order by created_at desc limit 1`)).rows[0];
      assert.equal(receiptAudit.before_state.document_received_by, "ผู้รับเดิม");
      assert.equal(Date.parse(receiptAudit.before_state.document_received_at), Date.parse("2026-10-20T01:00:00Z"));
      const confirmedAt = new Date().toISOString();
      const confirm = () => db.query(`update public.outage_jobs set document_received_at=$2, document_received_by=null
        where id=$1 and document_received_at is null and is_closed=false
          and (doc_status='GENERATED' or doc_generated_at is not null)
        returning document_received_at, document_received_by`, [id, confirmedAt]);
      assert.equal((await confirm()).rows.length, 1);
      assert.equal((await confirm()).rows.length, 0);
      await db.query(`select public.rollback_outage_job_workflow($1, 'DOCUMENT_CREATED', 'ยืนยันใหม่ผิด')`, [id]);
      const receiptHistory = (await db.query(`select * from public.outage_job_workflow_audit where to_step='DOCUMENT_CREATED' order by created_at`)).rows;
      assert.equal(receiptHistory.length, 2);
      assert.equal(receiptHistory[0].before_state.document_received_by, "ผู้รับเดิม");
      assert.equal(receiptHistory[1].before_state.document_received_by, null);
      assert.equal(Date.parse(receiptHistory[1].before_state.document_received_at), Date.parse(confirmedAt));

      // A failed history insert must abort the delivery change too.
      await db.exec(`create function public.fail_delivery_audit_test() returns trigger language plpgsql as $$begin raise exception 'test audit failure'; end;$$;
        create trigger fail_delivery_audit_test before insert on public.outage_job_document_delivery_audit for each row execute function public.fail_delivery_audit_test();`);
      await assert.rejects(db.query(`update public.outage_jobs set document_delivered_at='2026-10-20T03:00:00Z', document_delivered_by='ทดสอบล้มเหลว' where id=$1`, [id]), /test audit failure/);
      assert.equal((await db.query(`select document_delivered_at from public.outage_jobs where id=$1`, [id])).rows[0].document_delivered_at, null);
      await db.exec("set role anon");
      await assert.rejects(db.query(`select * from public.outage_job_document_delivery_audit`), error => error.code === "42501");
      await db.exec("reset role");
    } finally { await db.close(); }
  });
}
