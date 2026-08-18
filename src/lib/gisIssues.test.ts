import test from "node:test";
import assert from "node:assert/strict";
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
