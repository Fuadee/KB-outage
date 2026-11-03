// Isolated PostgreSQL; no production access.
// npm install --prefix .tmp/pg --no-save --no-package-lock @electric-sql/pglite
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../.tmp/pg/node_modules/@electric-sql/pglite');
const sql = name => fs.readFileSync(path.join(__dirname, '../sql', name), 'utf8');
const id = '11111111-1111-4111-8111-111111111111';
const periods = [{ start_time: '09:00', end_time: '10:00' }, { start_time: '16:00', end_time: '17:00' }];

test('033 preserves history, validates and synchronizes schedules atomically and rejects stale Social images', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
    for (const file of ['001_init.sql', '002_nakhon_and_doc.sql', '003_doc_fields.sql', '004_social_post.sql', '005_notice_schedule.sql', '006_close_jobs.sql', '018_document_workflow.sql', '021_outage_job_responsible_unit.sql', '023_job_workflow_rollback.sql', '026_notice_completion_provenance.sql']) await db.exec(sql(file));
    await db.exec(`create table public.social_announcement_images (id uuid primary key, job_id uuid references public.outage_jobs(id), generated_at timestamptz default now(), snapshot jsonb not null);`);
    await db.query(`insert into public.outage_jobs(id,outage_date,equipment_code,doc_time_start,doc_time_end) values ($1,'2026-11-12','KBA01','09:00','10:00')`, [id]);
    await db.exec(sql('033_multi_period_outage.sql'));
    await db.exec(sql('033_multi_period_outage.sql')); // rerunnable
    const read = async () => (await db.query('select * from public.outage_jobs where id=$1', [id])).rows[0];
    assert.equal((await read()).outage_periods, null, 'no automatic rewrite/backfill');
    await db.query(`update public.outage_jobs set note='unrelated edit' where id=$1`, [id]);
    assert.equal((await read()).outage_periods, null);
    await db.query(`update public.outage_jobs set outage_periods=$2::jsonb where id=$1`, [id, JSON.stringify([...periods].reverse())]);
    assert.deepEqual((await read()).outage_periods, periods);
    assert.equal((await read()).doc_time_start, '09:00');
    assert.equal((await read()).doc_time_end, '10:00', 'legacy END mirrors first period, never last');
    for (const invalid of [[], [{}], null, [{ start_time: '23:00', end_time: '01:00' }], [{ start_time: '09:00', end_time: '09:00' }], [{ start_time: '25:00', end_time: '26:00' }], [...periods, { start_time: '09:30', end_time: '11:00' }]]) {
      await assert.rejects(db.query(`update public.outage_jobs set outage_periods=$2::jsonb, note='invalid' where id=$1`, [id, JSON.stringify(invalid)]));
      assert.deepEqual((await read()).outage_periods, periods);
      assert.equal((await read()).note, 'unrelated edit', 'failed schedule rolls back the whole row update');
    }
    await assert.rejects(db.query(`update public.outage_jobs set doc_time_end='17:00' where id=$1`, [id]), /หลายช่วง/);
    assert.deepEqual((await read()).outage_periods, periods);

    // Exercise the actual publication function, including a later-period change.
    await db.query(`update public.outage_jobs set doc_status='GENERATED', document_received_at=now(), document_delivered_at=now(), notice_status='COMPLETED' where id=$1`, [id]);
    const snapshot = () => db.query(`select jsonb_build_object('outage_date',outage_date,'doc_time_start',doc_time_start,'doc_time_end',doc_time_end,'doc_area_title',doc_area_title,'doc_area_detail',doc_area_detail,'doc_purpose',doc_purpose,'map_link',map_link,'equipment_code',equipment_code,'outage_periods',outage_periods) as value from public.outage_jobs where id=$1`, [id]);
    const imageId = '22222222-2222-4222-8222-222222222222';
    await db.query(`insert into public.social_announcement_images(id,job_id,snapshot) values($1,$2,$3)`, [imageId,id,JSON.stringify((await snapshot()).rows[0].value)]);
    const changed = [periods[0], { start_time: '16:30', end_time: '17:30' }];
    await db.query(`update public.outage_jobs set outage_periods=$2::jsonb where id=$1`, [id, JSON.stringify(changed)]);
    await assert.rejects(db.query(`select public.complete_social_announcement($1,$2,'text',true)`, [id,imageId]), /สร้างภาพ/);
    assert.notEqual((await read()).social_status, 'POSTED');
    await db.query(`update public.social_announcement_images set snapshot=$2::jsonb where id=$1`, [imageId,JSON.stringify((await snapshot()).rows[0].value)]);
    await db.query(`select public.complete_social_announcement($1,$2,'text',true)`, [id,imageId]);
    assert.equal((await read()).social_status, 'POSTED');
    // Remove periods, then permit a legacy one-period client to edit without drift.
    await db.query(`update public.outage_jobs set outage_periods=$2::jsonb where id=$1`, [id, JSON.stringify([periods[0]])]);
    await db.query(`update public.outage_jobs set doc_time_end='11:00' where id=$1`, [id]);
    assert.deepEqual((await read()).outage_periods, [{ start_time: '09:00', end_time: '11:00' }]);
    assert.equal((await read()).notice_status, 'COMPLETED');
    assert.equal((await read()).is_closed, false);
    assert.equal((await db.query('select count(*)::int as count from public.outage_jobs')).rows[0].count, 1);
  } finally { await db.close(); }
});
