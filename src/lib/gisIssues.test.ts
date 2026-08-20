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

test("no-auth GIS migration keeps RLS and does not grant delete", () => {
  const migration = readFileSync(
    new URL("../../sql/019_gis_issues_noauth_rls.sql", import.meta.url),
    "utf8"
  );

  assert.match(migration, /for select\s+to anon\s+using \(true\)/i);
  assert.match(migration, /for insert\s+to anon/i);
  assert.match(migration, /for update\s+to anon/i);
  assert.doesNotMatch(migration, /grant\s+delete/i);
  assert.doesNotMatch(migration, /for\s+delete/i);
  assert.doesNotMatch(migration, /disable\s+row\s+level\s+security/i);
});

test("GIS server path has no login or local-only RPC secret dependency", () => {
  const serverSource = readFileSync(new URL("./gisIssuesServer.ts", import.meta.url), "utf8");

  assert.doesNotMatch(serverSource, /authorizeServerRequest|GIS_NOAUTH_RPC_SECRET/);
  assert.match(serverSource, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(serverSource, /ensureSystemCertificateAuthorities\(\)/);
});
