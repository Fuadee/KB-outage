import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helper = readFileSync(
  new URL("./dashboardSupabase.ts", import.meta.url),
  "utf8"
);
const jobsRoute = readFileSync(
  new URL("../app/api/dashboard/jobs/route.ts", import.meta.url),
  "utf8"
);
const summaryRoute = readFileSync(
  new URL("../app/api/dashboard/summary/route.ts", import.meta.url),
  "utf8"
);

test("dashboard Supabase client configures system CAs before client creation", () => {
  const configureIndex = helper.indexOf("ensureSystemCertificateAuthorities();");
  const createIndex = helper.indexOf("return createClient(");

  assert.ok(configureIndex >= 0);
  assert.ok(createIndex > configureIndex);
  assert.match(helper, /global: \{ fetch: fetchDashboardDependency \}/);
});

test("dashboard routes share the hardened server client without internal HTTP fetch", () => {
  for (const route of [jobsRoute, summaryRoute]) {
    assert.match(route, /createDashboardSupabaseClient\(\)/);
    assert.doesNotMatch(route, /fetch\(["'`]\/api\//);
    assert.doesNotMatch(route, /createClient\(/);
  }
});

test("dependency diagnostics do not include credentials or request headers", () => {
  const diagnostic = helper.slice(
    helper.indexOf('console.error("[dashboard-supabase] request failed"'),
    helper.indexOf("throw error;")
  );

  assert.match(helper, /origin: url\.origin/);
  assert.match(helper, /pathname: url\.pathname/);
  assert.doesNotMatch(diagnostic, /serviceRoleKey/);
  assert.doesNotMatch(diagnostic, /headers:/);
});
