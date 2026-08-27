import assert from "node:assert/strict";
import test from "node:test";
import { getRecommendedSocialDate, getSocialPublicationStatus } from "./socialPublication.ts";

test("chooses the first Monday or Friday in the seven-day outage window", () => {
  assert.equal(getRecommendedSocialDate("2026-09-14"), "2026-09-07");
  assert.equal(getRecommendedSocialDate("2026-09-15"), "2026-09-11");
  assert.equal(getRecommendedSocialDate("2026-09-18"), "2026-09-11");
  assert.equal(getRecommendedSocialDate("2026-09-19"), "2026-09-14");
});
test("does not recommend posting until the eligible window begins", () => {
  const status = getSocialPublicationStatus({ outageDate: "2026-09-18", now: new Date("2026-08-27T12:00:00Z") });
  assert.equal(status.state, "NOT_YET"); assert.equal(status.recommendedSocialDate, "2026-09-11");
});
test("identifies the recommended day, a remaining round, and a missed final round", () => {
  assert.equal(getSocialPublicationStatus({ outageDate: "2026-09-18", now: new Date("2026-09-11T12:00:00Z") }).state, "DUE_TODAY");
  const nextRound = getSocialPublicationStatus({ outageDate: "2026-09-25", now: new Date("2026-09-22T12:00:00Z") });
  assert.equal(nextRound.state, "NEXT_ROUND"); assert.equal(nextRound.nextPostingDate, "2026-09-25");
  assert.equal(getSocialPublicationStatus({ outageDate: "2026-09-18", now: new Date("2026-09-19T12:00:00Z") }).state, "OVERDUE");
});
test("validates posted dates against the outage date using Bangkok calendar dates", () => {
  const base = { outageDate: "2026-09-18", now: new Date("2026-09-12T12:00:00Z") };
  assert.equal(getSocialPublicationStatus({ ...base, socialPostedAt: "2026-09-10T17:30:00Z" }).state, "POSTED_VALID");
  assert.equal(getSocialPublicationStatus({ ...base, socialPostedAt: "2026-09-09T17:30:00Z" }).state, "POSTED_EARLY");
  assert.equal(getSocialPublicationStatus({ ...base, socialPostedAt: "2026-09-18T17:30:00Z" }).state, "POSTED_AFTER_OUTAGE");
});
test("keeps legacy posted jobs without a timestamp safe", () => {
  assert.equal(getSocialPublicationStatus({ outageDate: "2026-09-18", socialStatus: "POSTED" }).state, "POSTED_DATE_UNKNOWN");
});
