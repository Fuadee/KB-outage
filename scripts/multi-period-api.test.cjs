const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const PizZip = require('pizzip');
const { NextResponse } = require('next/server');
const periods = [{ start_time: '09:00', end_time: '10:00' }, { start_time: '16:00', end_time: '17:00' }];
const payload = { doc_issue_date: '2026-11-03', doc_purpose: 'ปรับปรุงระบบ', doc_area_title: 'พื้นที่กระบี่', doc_area_detail: 'ชุมชนกระบี่', map_link: 'https://www.google.com/maps?q=8.0,98.9', doc_time_start: '09:00', doc_time_end: '10:00' };
function harness(initial = {}) {
  const job = { id: '11111111-1111-4111-8111-111111111111', outage_date: '2026-11-12', equipment_code: 'KBA01', updated_at: '2026-11-03T00:00:00Z', ...initial };
  const patches = [];
  const client = { from() {
    let patch = null;
    const query = { select() { return query; }, eq() { return query; }, update(value) { patch = value; return query; },
      async single() { if (patch) { patches.push(patch); Object.assign(job, patch); } return { data: { ...job }, error: null }; },
      then(resolve) { if (patch) { patches.push(patch); Object.assign(job, patch); } return Promise.resolve({ data: { ...job }, error: null }).then(resolve); }
    }; return query;
  } };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/app/api/docs/create/route.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Buffer, Uint8Array, Date, Error, console: { info() {}, log() {}, error() {} },
    process: { env: { SUPABASE_URL: 'http://database.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only', NODE_ENV: 'test' } },
    require(name) {
      if (name === 'next/server') return { NextResponse };
      if (name === '@supabase/supabase-js') return { createClient: () => client };
      if (name === '@/lib/vulnerablePatientsCheck') return { runVulnerablePatientsCheck: async () => {} };
      if (name.startsWith('@/')) return require('../src/'+name.slice(2)+'.ts');
      return require(name);
    }
  });
  return { job, patches, post: data => exports.POST(new Request('http://localhost/api/docs/create', { method: 'POST', body: JSON.stringify({ jobId: job.id, payload: data }) })) };
}

test('document API rejects invalid schedules and malformed fields without writing any job state', async () => {
  for (const outage_periods of [[], null, [{}], [{ start_time: '09:00', end_time: '09:00' }], [{ start_time: '23:00', end_time: '01:00' }], [...periods, { start_time: '09:30', end_time: '11:00' }]]) {
    const h = harness();
    assert.equal((await h.post({ ...payload, outage_periods })).status, 400);
    assert.equal(h.patches.length, 0);
  }
  const h = harness();
  assert.equal((await h.post({ ...payload, doc_purpose: 123 })).status, 400);
  assert.equal(h.patches.length, 0);
});

test('document API saves sorted periods in one row update and returns a real Word document', async () => {
  const h = harness();
  const response = await h.post({ ...payload, outage_periods: [...periods].reverse(), doc_time_start: '00:00', doc_time_end: '23:59' });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(h.patches[0].outage_periods)), periods);
  assert.equal(h.patches[0].doc_time_start, '09:00');
  assert.equal(h.patches[0].doc_time_end, '10:00');
  assert.equal(h.patches.length, 2, 'single atomic schedule update, followed by generation status only');
  const text = new PizZip(Buffer.from(await response.arrayBuffer())).file('word/document.xml').asText().replace(/<[^>]+>/g,'');
  assert.ok(text.includes('09.00–10.00 น. และ 16.00–17.00 น.'));
  assert.equal(h.job.doc_status, 'GENERATED');
});

test('legacy one-period API remains supported; older clients cannot erase multi-period data', async () => {
  const legacy = harness();
  assert.equal((await legacy.post(payload)).status, 200);
  assert.equal(legacy.job.outage_periods.length, 1);
  const multi = harness({ outage_periods: periods });
  assert.equal((await multi.post(payload)).status, 409);
  assert.equal(multi.patches.length, 0);
  assert.deepEqual(multi.job.outage_periods, periods);
});
