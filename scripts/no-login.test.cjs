const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');

const root = path.resolve(__dirname, '..');
const id = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const cookies = ['', 'sb-access-token=expired; sb-refresh-token=expired', 'sb-access-token=%ZZ.not-a-jwt; sb-refresh-token=broken'];
const jobInput = { outage_date: '2026-09-12', equipment_code: 'TEST', responsible_unit: 'แผนกปฏิบัติการ', has_switching: false, customer_count: 5 };

// Run the actual TypeScript handlers. Substitute external I/O only; never load
// local environment files or contact a real Supabase, storage, or LINE service.
function harness(legacyFlag) {
  const tables = { outage_jobs: [], outage_job_workflow_audit: [] };
  const writes = [];
  let rpcError = null;
  const client = {
    from(table) {
      let operation = 'read', patch, filters = [], socialFilter = false;
      const query = {
        select() { return query; }, order() { return query; }, limit() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        or(expression) { assert.equal(expression, 'social_status.eq.POSTED,social_posted_at.not.is.null'); socialFilter = true; return query; },
        insert(value) { operation = 'insert'; patch = value; return query; },
        update(value) { operation = 'update'; patch = value; return query; },
        delete() { operation = 'delete'; return query; },
        single() { return execute(true); }, maybeSingle() { return execute(true); },
        then(resolve, reject) { return execute(false).then(resolve, reject); }
      };
      async function execute(single) {
        assert.ok(table in tables, `Unexpected table ${table}`);
        let rows = tables[table].filter(row => filters.every(filter => filter(row)) && (!socialFilter || row.social_status === 'POSTED' || row.social_posted_at));
        if (operation === 'insert') {
          rows = [{ id, is_closed: false, closed_by: null, ...patch }];
          tables[table].push(...rows);
        }
        if (operation === 'update') rows.forEach(row => Object.assign(row, patch));
        if (operation === 'delete') tables[table] = tables[table].filter(row => !rows.includes(row));
        if (operation !== 'read') writes.push({ table, operation, patch });
        return { data: single ? rows[0] ?? null : rows, error: null };
      }
      return query;
    },
    async rpc(name, args) {
      assert.equal(name, 'rollback_outage_job_workflow');
      assert.equal(args.p_job_id, id);
      if (rpcError) return { data: null, error: rpcError };
      return { data: { job: tables.outage_jobs[0], audit: { reason: args.p_reason } }, error: null };
    }
  };
  let batch = null;
  let targets = [];
  let tokenRevision = 0;
  let uploads = 0;
  class DeliveryTrackingError extends Error {}
  const delivery = {
    DeliveryTrackingError,
    async getOrCreateDeliveryBatchByJobId(jobId) { assert.equal(jobId, id); return batch ??= { id: 'batch', job_id: id, access_token: 'token-0', is_active: true, created_by: null }; },
    async getDeliveryBatchWithTargetsByJobId(jobId) { assert.equal(jobId, id); return batch ? { batch, targets } : null; },
    async regenerateDeliveryBatchToken(jobId) { await delivery.getOrCreateDeliveryBatchByJobId(jobId); batch.access_token = `token-${++tokenRevision}`; return batch; },
    async replaceDeliveryTargets(batchId, items) { assert.equal(batchId, 'batch'); targets = items.map(item => ({ ...item, id: targetId })); return targets; },
    async uploadDeliveryProof({ batchId, targetId: target, file }) { assert.equal(batchId, 'batch'); assert.equal(target, targetId); assert.equal(file.type, 'image/png'); uploads++; return 'https://storage.invalid/proof.png'; },
    async markTargetDeliveredByToken({ token, targetId: target, proofImageUrl }) { assert.equal(token, batch.access_token); assert.equal(target, targetId); return { id: target, status: 'delivered', delivered_at: '2026-09-12T00:00:00Z', proof_image_url: proofImageUrl }; },
    async getDeliveryBatchByToken(token) { return batch?.access_token === token ? batch : null; },
    async getDeliveryBatchWithTargetsByToken(token) { return batch?.access_token === token ? { batch, targets } : null; }
  };
  const env = { NODE_ENV: 'production', SUPABASE_URL: 'https://database.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-server-key', NEXT_PUBLIC_SUPABASE_URL: 'https://database.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key', REMINDER_JOB_SECRET: 'test-scheduler-secret' };
  if (legacyFlag !== undefined) env.NEXT_PUBLIC_AUTH_DISABLED = legacyFlag;
  const modules = new Map();
  const overrides = {
    'next/server': { NextRequest, NextResponse },
    'next/headers': { cookies() { throw new Error('User cookies must not be consulted'); } },
    '@supabase/supabase-js': { createClient() { return client; } },
    '@/lib/serverTls': { ensureSystemCertificateAuthorities() {} },
    '@/lib/deliveryTracking': delivery,
    '@/lib/sameDayReminderService': {
      createEmptyNoticeDistributionSummary: () => ({}),
      createEmptySameDayReminderSummary: () => ({}),
      runSameDayReminder() { throw new Error('Scheduler must reject bad credentials before running'); }
    }
  };
  function load(file) {
    const absolute = path.resolve(root, file);
    if (modules.has(absolute)) return modules.get(absolute);
    const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {};
    modules.set(absolute, exports);
    vm.runInNewContext(code, {
      exports, process: { env }, console: { log() {}, info() {}, warn() {}, error() {} },
      URL, Request, Response, Headers, File, FormData, Buffer, Date, Error,
      fetch() { throw new Error('Real network access is forbidden in these tests'); },
      require(name) {
        if (name in overrides) return overrides[name];
        if (name.startsWith('@/') || name.startsWith('.')) {
          let resolved = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
          if (!path.extname(resolved)) resolved += '.ts';
          return load(resolved);
        }
        if (name === 'node:crypto') return require(name);
        throw new Error(`Unexpected dependency: ${name}`);
      }
    }, { filename: absolute });
    return exports;
  }
  async function call(route, method, body, cookie = '', params = { id }, query = '') {
    const headers = new Headers(cookie ? { cookie } : {});
    if (body && !(body instanceof FormData)) headers.set('content-type', 'application/json');
    const request = new NextRequest(`http://localhost/api/${route}${query}`, { method, headers, ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
    return load(`src/app/api/${route}/route.ts`)[method](request, { params });
  }
  return { load, call, tables, writes, env, overrides, delivery, setRpcError: value => { rpcError = value; }, uploadCount: () => uploads };
}

for (const flag of [undefined, 'true', 'false']) {
  for (const [cookieIndex, cookie] of cookies.entries()) {
    test(`anonymous CRUD/workflow/delivery: legacy=${flag ?? 'absent'}, cookies=${cookieIndex}`, async () => {
      const h = harness(flag);
      const ok = async (route, method, body, expected = 200, params, query) => {
        const response = await h.call(route, method, body, cookie, params, query);
        const payload = await response.json();
        assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(payload)}`);
        assert.equal(response.headers.get('location'), null);
        return payload;
      };
      await ok('jobs', 'POST', jobInput, 201);
      const rows = await ok('jobs', 'GET', undefined, 200, undefined, '?date=2026-09-12');
      assert.equal(rows[0].id, id);
      await ok('jobs/[id]', 'PATCH', { ...jobInput, equipment_code: 'UPDATED' });
      assert.equal(h.tables.outage_jobs[0].equipment_code, 'UPDATED');
      h.tables.outage_jobs[0].doc_status = 'GENERATED';
      await ok('jobs/[id]/document-workflow', 'PATCH', { action: 'receive', occurred_at: '2026-09-12T01:00:00Z', operator: 'Receiver' });
      await ok('jobs/[id]/document-workflow', 'PATCH', { action: 'deliver', occurred_at: '2026-09-12T02:00:00Z', operator: 'Courier' });
      assert.equal(h.tables.outage_jobs[0].document_received_by, 'Receiver');
      assert.equal(h.tables.outage_jobs[0].document_delivered_by, 'Courier');
      await ok('jobs/notice-schedule', 'POST', { jobId: id, notice_date: '2026-09-12' });
      await ok('jobs/[id]/notice-completion', 'PATCH', { completed_at: '2026-09-12T03:00:00Z', completed_by: 'Distributor' });
      assert.equal(h.tables.outage_jobs[0].notice_by, 'Distributor');
      await ok('jobs/[id]/workflow-rollback', 'GET');
      await ok('jobs/[id]/workflow-rollback', 'POST', { target_step: 'DOCUMENT_CREATED', reason: 'Correct entry' });
      const prefix = 'jobs/[id]/delivery-batch';
      await ok(prefix, 'GET');
      await ok(prefix, 'POST', {});
      await ok(`${prefix}/token`, 'POST');
      await ok(`${prefix}/targets`, 'POST', { targets: [{ company_name: 'Test customer' }] });
      const regenerated = await ok(`${prefix}/token/regenerate`, 'POST');
      assert.equal(regenerated.data.batch.access_token, 'token-1');
      const form = new FormData();
      form.set('proof', new File(['test-image'], 'proof.png', { type: 'image/png' }));
      const proof = await ok(`${prefix}/targets/[targetId]/proof`, 'POST', form, 200, { id, targetId });
      assert.equal(proof.data.status, 'delivered');
      assert.equal(h.uploadCount(), 1);
      h.tables.outage_jobs[0].social_status = 'POSTED';
      await ok('jobs/[id]/close', 'POST');
      assert.equal(h.tables.outage_jobs[0].closed_by, null);
      await ok('jobs/[id]/delete', 'DELETE');
      assert.equal(h.tables.outage_jobs.length, 0);
    });
  }
}

test('invalid data, workflow states, and database errors still fail without login', async () => {
  const h = harness('false');
  assert.equal((await h.call('jobs', 'POST', {})).status, 400);
  assert.equal((await h.call('jobs/[id]', 'PATCH', jobInput, '', { id: 'bad' })).status, 400);
  assert.equal((await h.call('jobs/[id]/delivery-batch/token', 'POST', undefined, '', { id: 'bad' })).status, 400);
  assert.equal((await h.call('jobs/[id]/delivery-batch/targets', 'POST', {})).status, 400);
  await h.call('jobs', 'POST', jobInput);
  assert.equal((await h.call('jobs/[id]/close', 'POST')).status, 409);
  assert.equal((await h.call('jobs/[id]/document-workflow', 'PATCH', { action: 'receive', occurred_at: '2026-09-12', operator: 'Operator' })).status, 409);
  assert.equal((await h.call('jobs/notice-schedule', 'POST', { jobId: id, notice_date: '2026-09-12' })).status, 409);
  assert.equal((await h.call('jobs/[id]/notice-completion', 'PATCH', { completed_at: '2026-09-12', completed_by: 'Operator' })).status, 409);
  assert.equal((await h.call('jobs/[id]/workflow-rollback', 'POST', { target_step: 'BAD', reason: 'test' })).status, 400);
  h.setRpcError({ code: '22023', message: 'not before current workflow step' });
  assert.equal((await h.call('jobs/[id]/workflow-rollback', 'POST', { target_step: 'DOCUMENT_CREATED', reason: 'test' })).status, 409);
  h.setRpcError({ code: '42501', message: 'permission denied' });
  assert.equal((await h.call('jobs/[id]/workflow-rollback', 'POST', { target_step: 'DOCUMENT_CREATED', reason: 'test' })).status, 500);
});

test('closing preserves historical attribution and remains idempotent', async () => {
  const h = harness();
  h.tables.outage_jobs.push({ id, is_closed: false, social_status: 'POSTED', closed_by: 'historical-user-id' });
  assert.equal((await h.call('jobs/[id]/close', 'POST')).status, 200);
  assert.equal(h.tables.outage_jobs[0].closed_by, 'historical-user-id');
  const closedAt = h.tables.outage_jobs[0].closed_at;
  assert.equal((await h.call('jobs/[id]/close', 'POST')).status, 200);
  assert.equal(h.tables.outage_jobs[0].closed_at, closedAt);
});

test('public delivery tokens and proof validation remain enforced', async () => {
  const h = harness();
  assert.equal((await h.call('public-delivery/[token]', 'GET', undefined, '', { token: 'invalid' })).status, 404);
  const form = new FormData();
  form.set('proof', new File(['image'], 'proof.png', { type: 'image/png' }));
  const response = await h.call('public-delivery/[token]/targets/[targetId]/proof', 'POST', form, '', { token: 'invalid', targetId });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'INVALID_TOKEN');
  assert.equal(h.uploadCount(), 0);
  const bad = new FormData();
  bad.set('proof', new File(['text'], 'proof.txt', { type: 'text/plain' }));
  assert.equal((await h.call('jobs/[id]/delivery-batch/targets/[targetId]/proof', 'POST', bad, '', { id, targetId })).status, 400);
});

test('scheduler still requires its own secret before running', async () => {
  const h = harness();
  const route = h.load('src/app/api/jobs/reminder/same-day/run/route.ts');
  for (const method of ['GET', 'POST']) {
    for (const secret of [undefined, 'incorrect']) {
      const request = new NextRequest('http://localhost/api/jobs/reminder/same-day/run', { method, headers: secret ? { 'x-reminder-secret': secret } : {} });
      assert.equal((await route[method](request)).status, secret ? 403 : 401);
    }
  }
});

test('runtime source cannot restore user auth; legacy route is only a dashboard redirect', () => {
  function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
  for (const file of walk(path.join(root, 'src')).filter(file => /\.(ts|tsx)$/.test(file) && !file.includes('.test.'))) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /AUTH_DISABLED|authorizeServerRequest|ensureAuthenticated|sb-access-token|sb-refresh-token|\.auth\.(getSession|getUser|signIn\w*|signOut|onAuthStateChange)|["']\/login["']/, file);
  }
  assert.equal(fs.existsSync(path.join(root, 'src/middleware.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/app/api/auth/session/route.ts')), false);
  const login = fs.readFileSync(path.join(root, 'src/app/login/page.tsx'), 'utf8');
  assert.match(login, /redirect\("\/dashboard"\)/);
  assert.doesNotMatch(login, /use client|supabase|<form/);
});

test('browser database requests ignore saved sessions and URL tokens', async () => {
  const h = harness('false');
  let configuration;
  h.overrides['@supabase/supabase-js'] = { createClient(_url, _key, options) { configuration = options; return {}; } };
  h.load('src/lib/supabase/client.ts').createClient();
  assert.equal(configuration.auth.persistSession, false);
  assert.equal(configuration.auth.autoRefreshToken, false);
  assert.equal(configuration.auth.detectSessionInUrl, false);
  const { createClient } = require('@supabase/supabase-js');
  let storageReads = 0;
  let requestHeaders;
  const client = createClient('https://database.invalid', 'anonymous-key', {
    ...configuration,
    auth: { ...configuration.auth, storage: { getItem() { storageReads++; throw new Error('Old session storage must not be read'); }, setItem() {}, removeItem() {} } },
    global: { fetch: async (_url, init) => { requestHeaders = new Headers(init.headers); return new Response('[]', { headers: { 'content-type': 'application/json' } }); } }
  });
  const result = await client.from('outage_jobs').select('id');
  assert.equal(result.error, null);
  assert.equal(storageReads, 0);
  assert.equal(requestHeaders.get('authorization'), 'Bearer anonymous-key');
});
