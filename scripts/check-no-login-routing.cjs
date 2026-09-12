const assert = require('node:assert/strict');

const base = process.argv.find(value => value.startsWith('--base-url='))?.slice(11) ?? 'http://localhost:3000';
const paths = ['/', '/dashboard', '/jobs', '/new', '/job/00000000-0000-4000-8000-000000000001', '/calendar', '/gis-issues', '/gis-issues/new', '/bedridden-patients', '/special-watchlist', '/job/00000000-0000-4000-8000-000000000001/major-customers', '/login'];
const cookies = ['', 'sb-access-token=expired; sb-refresh-token=expired', 'sb-access-token=%ZZ.not-a-jwt; sb-refresh-token=broken'];

(async () => {
  let checked = 0;
  for (const cookie of cookies) {
    for (const path of paths) {
      // Two direct requests also verify that reloads do not require prior navigation.
      for (let reload = 0; reload < 2; reload++) {
        let url = new URL(path, base);
        let response;
        for (let hop = 0; hop < 5; hop++) {
          response = await fetch(url, { redirect: 'manual', headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(30000) });
          const location = response.headers.get('location');
          if (!location) break;
          url = new URL(location, url);
          assert.notEqual(url.pathname, '/login', `${path} redirected into login`);
        }
        assert.equal(response.status, 200, `${path}: ${response.status}`);
        if (path === '/' || path === '/login') assert.equal(url.pathname, '/dashboard');
        const body = await response.text();
        assert.doesNotMatch(body, /type="password"|สมัครด้วยอีเมลนี้/);
        checked++;
      }
    }
  }
  // No reports page exists in this repository; verify it remains a 404, not an Auth redirect.
  const reports = await fetch(new URL('/reports', base), { redirect: 'manual' });
  assert.equal(reports.status, 404);
  assert.equal(reports.headers.get('location'), null);
  console.log(`PASS: ${checked} routing requests; /reports remains 404 (route does not exist).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
