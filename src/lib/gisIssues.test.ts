import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canTransitionGisIssue,
  getGisIssueTypeLabel,
  getNextGisIssueStatus
} from "./gisIssues.ts";

test("GIS issue follows the four-step workflow", () => {
  assert.equal(getNextGisIssueStatus("OPEN"), "IN_PROGRESS");
  assert.equal(getNextGisIssueStatus("IN_PROGRESS"), "VERIFYING");
  assert.equal(getNextGisIssueStatus("VERIFYING"), "CLOSED");
  assert.equal(getNextGisIssueStatus("CLOSED"), null);
});

test("GIS issue cannot skip a workflow step", () => {
  assert.equal(canTransitionGisIssue("OPEN", "VERIFYING"), false);
  assert.equal(canTransitionGisIssue("IN_PROGRESS", "CLOSED"), false);
  assert.equal(canTransitionGisIssue("OPEN", "IN_PROGRESS"), true);
});

test("an active or closed GIS issue can be reopened", () => {
  assert.equal(canTransitionGisIssue("IN_PROGRESS", "OPEN"), true);
  assert.equal(canTransitionGisIssue("VERIFYING", "OPEN"), true);
  assert.equal(canTransitionGisIssue("CLOSED", "OPEN"), true);
});

test("OTHER issue type uses its custom label", () => {
  assert.equal(getGisIssueTypeLabel("OTHER", "ชื่อประเภทกำหนดเอง"), "ชื่อประเภทกำหนดเอง");
});

test("no-auth GIS migrations grant CRUD while keeping RLS", () => {
  const accessMigration = readFileSync(
    new URL("../../sql/019_gis_issues_noauth_rls.sql", import.meta.url),
    "utf8"
  );
  const deleteMigration = readFileSync(
    new URL("../../sql/020_gis_issue_delete.sql", import.meta.url),
    "utf8"
  );

  assert.match(accessMigration, /for select\s+to anon\s+using \(true\)/i);
  assert.match(accessMigration, /for insert\s+to anon/i);
  assert.match(accessMigration, /for update\s+to anon/i);
  assert.match(deleteMigration, /for delete\s+to anon\s+using \(true\)/i);
  assert.match(deleteMigration, /grant delete on table public\.gis_issues to anon/i);
  assert.doesNotMatch(deleteMigration, /grant delete on table public\.gis_issue_activities/i);
  assert.doesNotMatch(
    `${accessMigration}\n${deleteMigration}`,
    /disable\s+row\s+level\s+security/i
  );
});

test("GIS activities cascade when their parent issue is deleted", () => {
  const schema = readFileSync(
    new URL("../../sql/016_gis_issues.sql", import.meta.url),
    "utf8"
  );

  assert.match(
    schema,
    /issue_id uuid not null references public\.gis_issues\(id\) on delete cascade/i
  );
});

test("GIS detail implements a confirmed API delete flow", () => {
  const apiSource = readFileSync(
    new URL("../app/api/gis-issues/[id]/route.ts", import.meta.url),
    "utf8"
  );
  const detailSource = readFileSync(
    new URL("../app/(app)/gis-issues/[id]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(apiSource, /export async function DELETE/);
  assert.match(apiSource, /\.from\("gis_issues"\)\s*\.delete\(\)/);
  assert.match(detailSource, /title=\{`ลบ \$\{issue\.issue_number\} \?`\}/);
  assert.match(detailSource, /method: "DELETE"/);
  assert.match(detailSource, /router\.replace\("\/gis-issues"\)/);
});

test("GIS server path has no login or local-only RPC secret dependency", () => {
  const serverSource = readFileSync(new URL("./gisIssuesServer.ts", import.meta.url), "utf8");

  assert.doesNotMatch(serverSource, /authorizeServerRequest|GIS_NOAUTH_RPC_SECRET/);
  assert.match(serverSource, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(serverSource, /ensureSystemCertificateAuthorities\(\)/);
});
