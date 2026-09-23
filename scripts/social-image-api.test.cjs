const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextResponse } = require('next/server');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const id = '11111111-1111-4111-8111-111111111111';
function harness() {
  const job = { id, outage_date: '2026-09-20', doc_time_start: '09:00', doc_time_end: '15:00', doc_area_title: 'หาดอ่าวนาง', doc_area_detail: null, doc_purpose: null, map_link: null, equipment_code: 'KBA01', doc_status: 'GENERATED', notice_status: 'COMPLETED', document_delivered_at: '2026-09-01' };
  const assets = [], stored = new Map();
  let rpcCalls = 0, failInsert = false;
  const bucket = {
    async upload(key, value) { assert.equal(stored.has(key), false); stored.set(key, value); return { error: null }; },
    async download(key) { return stored.has(key) ? { data: new Blob([stored.get(key)]), error: null } : { error: new Error('missing') }; },
    async createSignedUrl(key) { return { data: { signedUrl: `https://storage.invalid/${key}` } }; },
    async remove(keys) { keys.forEach(key => stored.delete(key)); return { error: null }; }
  };
  const client = {
    storage: { from() { return bucket; } },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        async single() { return { data: { ...job }, error: null }; },
        async insert(value) { if (failInsert) return { error: new Error('save failed') }; assert.equal(table, 'social_announcement_images'); assets.push({ ...value, id: String(assets.length + 1) }); return { error: null }; }
      }; return query;
    },
    async rpc(name, args) { rpcCalls++; assert.equal(name, 'complete_social_announcement'); assert.equal(args.p_confirmed, true); return { data: [{ ...job, social_status: 'POSTED' }], error: null }; }
  };
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {}; cache.set(absolute, exports);
    const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { exports, process, console: { error() {} }, Buffer, Request, Response, Headers, URL, File, FormData, Date, Error,
      require(name) {
        if (name === 'next/server') return { NextResponse };
        if (name === '@/lib/socialImageServer') return { SOCIAL_BUCKET: 'test', socialServerClient: () => client, latestSocialImage: async () => assets.at(-1) ?? null };
        if (name.startsWith('@/') || name.startsWith('.')) {
          let target = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
          if (!target.endsWith('.ts')) target += '.ts';
          return load(target);
        }
        return require(name);
      }
    }, { filename: absolute });
    return exports;
  }
  const imageRoute = load('src/app/api/jobs/[id]/social-image/route.ts');
  const postRoute = load('src/app/api/jobs/social-post/route.ts');
  return { job, assets, stored, imageRoute, postRoute, failSave() { failInsert = true; }, get rpcCalls() { return rpcCalls; } };
}
const ctx = { params: { id } };
function upload(file, view) { const form = new FormData(); if (file) form.set('map', file); if (view) form.set('map_view', JSON.stringify(view)); return new Request('http://localhost/image', { method: 'POST', body: form }); }
function publish(imageId, confirmed) { return new Request('http://localhost/social-post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: id, imageId, confirmed }) }); }
test('real handlers reject missing/unsupported maps and enforce confirmation and stale images server-side', async () => {
  const h = harness();
  assert.equal((await h.imageRoute.POST(upload(), ctx)).status, 400);
  assert.equal((await h.imageRoute.POST(upload(new File(['bad'], 'map.png', { type: 'image/png' })), ctx)).status, 400);
  const png = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#ddd' } }).png().toBuffer();
  assert.equal((await h.imageRoute.POST(upload(new File([png], '../../map.png', { type: 'image/png' })), ctx)).status, 200);
  assert.equal(h.stored.size, 2);
  assert.equal(h.assets[0].snapshot.outage_date, '2026-09-20');
  assert.deepEqual(JSON.parse(JSON.stringify(h.assets[0].snapshot.map_view)), { mode: 'fit', zoom: 1, x: 0.5, y: 0.5 });
  assert.match(h.assets[0].source_path, /\/source\/[a-f0-9-]+\.png$/);
  assert.equal((await h.postRoute.POST(publish('1', false))).status, 400);
  assert.equal((await h.postRoute.POST(publish('other', true))).status, 409);
  assert.equal(h.rpcCalls, 0);
  const completed = await h.postRoute.POST(publish('1', true));
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).job.social_status, 'POSTED');
  h.job.outage_date = '2026-09-21';
  assert.equal((await h.postRoute.POST(publish('1', true))).status, 409);
  assert.equal((await h.imageRoute.GET(new Request('http://localhost/image?download=1'), ctx)).status, 409);
  assert.equal((await h.imageRoute.POST(upload(undefined, { mode: 'fill', zoom: 1.5, x: 0.2, y: 0.8 }), ctx)).status, 200);
  assert.equal(h.assets.length, 2);
  assert.equal(h.assets[1].source_path, h.assets[0].source_path);
  assert.notEqual(h.assets[1].generated_path, h.assets[0].generated_path);
  assert.equal(h.assets[1].snapshot.outage_date, '2026-09-21');
  assert.deepEqual(JSON.parse(JSON.stringify(h.assets[1].snapshot.map_view)), { mode: 'fill', zoom: 1.5, x: 0.2, y: 0.8 });
  assert.equal((await h.imageRoute.POST(upload(undefined, { mode: 'fill', zoom: 9, x: 0.5, y: 0.5 }), ctx)).status, 400);
  assert.equal((await h.imageRoute.POST(upload(), ctx)).status, 200);
  assert.equal(h.assets[2].snapshot.map_view.zoom, 1.5);
  assert.equal((await h.imageRoute.GET(new Request('http://localhost/image?download=1'), ctx)).headers.get('Content-Type'), 'image/png');
  h.job.doc_time_end = '16:00';
  assert.equal((await h.postRoute.POST(publish('3', true))).status, 409);
});
test('storage assets are cleaned up when metadata persistence fails', async () => {
  const h = harness(); h.failSave();
  const png = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#ddd' } }).png().toBuffer();
  assert.equal((await h.imageRoute.POST(upload(new File([png], 'map.png', { type: 'image/png' })), ctx)).status, 400);
  assert.equal(h.stored.size, 0);
});

test('preview is byte-identical to generated/downloaded output and never persists assets', async () => {
  const cases = {
    fontSample: 'ซอยนครธรรม',
    watKhok: 'หน้าวัดโคก ถึง เอคอมพิวเตอร์',
    threeLines: 'หาดอ่าวนาง\nชุมชนใกล้เคียง\nโรงเรียนบ้านอ่าวนาง',
    short: 'หาดอ่าวนาง',
    medium: 'อ่าวนางซอย 1 และพื้นที่ใกล้เคียง',
    long: 'หาดอ่าวนางและพื้นที่ใกล้เคียง ตั้งแต่สามแยกโรงเรียนบ้านอ่าวนางถึงบริเวณชุมชนมัสยิดและถนนเลียบชายหาด',
    mixed: 'ตั้งแต่บริษัทเมืองคอนสตรัคชั่น จำกัด ถึงโรงเรียน A-Chuan'
  };
  const map = await sharp(Buffer.from('<svg width="1400" height="600"><rect width="1400" height="600" fill="#dce6cf"/><path d="M0 400 L1400 150" stroke="white" stroke-width="40"/><circle cx="300" cy="250" r="100" fill="#f9d942"/></svg>')).png().toBuffer();
  fs.mkdirSync(path.join(root, '.tmp/social-parity'), { recursive: true });
  for (const [name, area] of Object.entries(cases)) {
    for (const view of [{ mode: 'fit', zoom: 1, x: 0.5, y: 0.5 }, { mode: 'fill', zoom: 1.5, x: 0.2, y: 0.8 }]) {
      const h = harness(); h.job.doc_area_title = area;
      if (name === 'fontSample') {
        h.job.outage_date = '2026-09-25';
        h.job.doc_time_start = '09:00';
        h.job.doc_time_end = '11:00';
      }
      const file = new File([map], 'map.png', { type: 'image/png' });
      const previewRequest = upload(file, view);
      const preview = await h.imageRoute.POST(new Request('http://localhost/image?preview=1', previewRequest), ctx);
      assert.equal(preview.status, 200);
      assert.equal(preview.headers.get('Content-Type'), 'image/png');
      assert.equal(preview.headers.get('Cache-Control'), 'no-store');
      const previewBytes = Buffer.from(await preview.arrayBuffer());
      assert.equal(h.assets.length, 0);
      assert.equal(h.stored.size, 0);
      assert.equal((await h.imageRoute.POST(upload(file, view), ctx)).status, 200);
      const download = await h.imageRoute.GET(new Request('http://localhost/image?download=1'), ctx);
      const output = Buffer.from(await download.arrayBuffer());
      assert.deepEqual(previewBytes, output, `${name}/${view.mode}: all pixels, wrapping and spacing must match`);
      const savedPreview = await h.imageRoute.POST(new Request('http://localhost/image?preview=1', upload(undefined, view)), ctx);
      assert.deepEqual(Buffer.from(await savedPreview.arrayBuffer()), output);
      assert.equal(h.assets.length, 1);
      assert.equal(h.stored.size, 2);
      await sharp({ create: { width: 2160, height: 1350, channels: 4, background: 'white' } })
        .composite([{ input: previewBytes, left: 0, top: 0 }, { input: output, left: 1080, top: 0 }])
        .toFile(path.join(root, `.tmp/social-parity/${name}-${view.mode}.png`));
    }
  }
});
