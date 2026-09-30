import test from "node:test";
import assert from "node:assert/strict";
import { getSocialPublicationStatus } from "./socialPublication.ts";
import { getDistributionReminderStatus } from "./distributionReminder.ts";
import {
  getDocumentWorkflowAction,
  getDocumentWorkflowStage,
  getJobQueueState,
  getWaitingForTimeLabel,
  isJobActionableNow,
  isReadyForExecution
} from "./documentWorkflow.ts";

const documentReady = { doc_status: "GENERATED" };

const octoberSocialJob = {
  equipment_code: "KBB01WF-106",
  outage_date: "2026-10-05",
  notice_status: "COMPLETED",
  social_status: "DRAFT"
};

test("Social next round shares the card date and waits on September 30", () => {
  const now = new Date("2026-09-30T12:00:00+07:00");
  const social = getSocialPublicationStatus({ outageDate: octoberSocialJob.outage_date, now });
  assert.equal(social.state, "NEXT_ROUND");
  assert.equal(social.nextPostingDate, "2026-10-02");
  const queue = getJobQueueState(octoberSocialJob, now);
  assert.deepEqual(queue, { kind: "WAITING_FOR_TIME", reason: "SOCIAL", nextActionDate: social.nextActionDate });
  assert.equal(isJobActionableNow(octoberSocialJob, now), false);
  if (queue.kind === "WAITING_FOR_TIME") assert.match(getWaitingForTimeLabel(queue), /รอโพสต์ Social.*02 ต\.ค\. 69/);
});

for (const date of ["2026-10-02", "2026-10-03"]) {
  test(`incomplete Social is actionable on ${date} without moving its October 2 due date`, () => {
    const now = new Date(`${date}T12:00:00+07:00`);
    assert.equal(getSocialPublicationStatus({ outageDate: octoberSocialJob.outage_date, now }).nextActionDate, "2026-10-02");
    assert.equal(getJobQueueState(octoberSocialJob, now).kind, "ACTIONABLE_NOW");
  });
}

test("Social becomes actionable at Bangkok midnight and stays overdue through later rounds", () => {
  assert.equal(getJobQueueState(octoberSocialJob, new Date("2026-10-01T16:59:59Z")).kind, "WAITING_FOR_TIME");
  for (const instant of ["2026-10-01T17:00:00Z", "2026-10-04T12:00:00Z", "2026-10-05T12:00:00Z", "2026-10-06T12:00:00Z"]) {
    assert.equal(getJobQueueState(octoberSocialJob, new Date(instant)).kind, "ACTIONABLE_NOW");
  }
});

test("completed Social leaves both preparation queues and continues to close", () => {
  const now = new Date("2026-09-30T12:00:00+07:00");
  for (const completion of [{ social_status: "POSTED" }, { social_posted_at: "2026-09-30T04:00:00Z" }]) {
    const job = { ...octoberSocialJob, ...completion };
    assert.equal(getJobQueueState(job, now).kind, "READY_FOR_OPERATION");
    assert.equal(getDocumentWorkflowAction(job), "CLOSE_JOB");
    assert.equal(getSocialPublicationStatus({ outageDate: job.outage_date, socialStatus: job.social_status, ...("social_posted_at" in job ? { socialPostedAt: job.social_posted_at } : {}), now }).nextActionDate, null);
  }
});

test("notice overdue by two days remains actionable on September 30", () => {
  const now = new Date("2026-09-30T12:00:00+07:00");
  const job = { equipment_code: "KBB09WF-110", outage_date: "2026-10-05", notice_status: "SCHEDULED", notice_date: "2026-09-28" };
  const notice = getDistributionReminderStatus({ outageDate: job.outage_date, noticeDate: job.notice_date, noticeStatus: job.notice_status, now });
  assert.equal(notice.daysOverdue, 2);
  assert.equal(getJobQueueState(job, now).kind, "ACTIONABLE_NOW");
});

test("case A follows every persisted document workflow stage", () => {
  assert.equal(getDocumentWorkflowStage({}), "DRAFT");
  assert.equal(getDocumentWorkflowStage(documentReady), "WAITING_DOCUMENT");
  assert.equal(
    getDocumentWorkflowStage({
      ...documentReady,
      document_received_at: "2026-08-20T02:00:00.000Z"
    }),
    "WAITING_DELIVERY"
  );
  assert.equal(
    getDocumentWorkflowStage({
      ...documentReady,
      document_received_at: "2026-08-20T02:00:00.000Z",
      document_delivered_at: "2026-08-20T03:00:00.000Z"
    }),
    "READY_FOR_NOTICE"
  );
  assert.equal(
    getDocumentWorkflowStage({ ...documentReady, social_status: "POSTED" }),
    "SOCIAL_POSTED"
  );
  assert.equal(
    getDocumentWorkflowStage({
      ...documentReady,
      notice_status: "SCHEDULED"
    }),
    "NOTICE_SCHEDULED"
  );
  assert.equal(
    getDocumentWorkflowStage({
      ...documentReady,
      notice_status: "COMPLETED",
      notice_completed_at: "2026-08-20T05:00:00.000Z"
    }),
    "READY_FOR_SOCIAL"
  );
});

test("cases B-D return the operational next action", () => {
  assert.equal(getDocumentWorkflowAction(documentReady), "RECEIVE_DOCUMENT");
  assert.equal(
    getDocumentWorkflowAction({
      ...documentReady,
      document_received_at: "2026-08-20T02:00:00.000Z"
    }),
    "DELIVER_DOCUMENT"
  );
  assert.equal(
    getDocumentWorkflowAction({
      ...documentReady,
      document_received_at: "2026-08-20T02:00:00.000Z",
      document_delivered_at: "2026-08-20T03:00:00.000Z"
    }),
    "SCHEDULE_NOTICE"
  );
  assert.equal(
    getDocumentWorkflowAction({
      ...documentReady,
      document_received_at: "2026-08-20T02:00:00.000Z",
      document_delivered_at: "2026-08-20T03:00:00.000Z",
      notice_status: "SCHEDULED"
    }),
    "COMPLETE_NOTICE"
  );
  assert.equal(
    getDocumentWorkflowAction({
      ...documentReady,
      document_received_at: "2026-08-20T02:00:00.000Z",
      document_delivered_at: "2026-08-20T03:00:00.000Z",
      notice_status: "COMPLETED",
      notice_completed_at: "2026-08-20T05:00:00.000Z"
    }),
    "POST_SOCIAL"
  );
});

test("case E keeps legacy Social and SENT rows at their completed stage", () => {
  assert.equal(
    getDocumentWorkflowStage({ doc_status: "GENERATED", social_status: "POSTED" }),
    "SOCIAL_POSTED"
  );
  assert.equal(
    getDocumentWorkflowStage({
      doc_status: "GENERATED",
      notice_status: "SENT"
    }),
    "READY_FOR_SOCIAL"
  );
});

test("a planned delivery date does not mark distribution as completed", () => {
  const job = {
    ...documentReady,
    document_received_at: "2026-08-20T02:00:00.000Z",
    document_delivered_at: "2026-08-20T03:00:00.000Z",
    notice_status: "SCHEDULED",
    notice_date: "2026-08-21"
  };

  assert.equal(getDocumentWorkflowStage(job), "NOTICE_SCHEDULED");
  assert.equal(getDocumentWorkflowAction(job), "COMPLETE_NOTICE");
});

test("ready for execution starts only after Social is completed and ends on close or rollback", () => {
  const awaitingSocial = {
    ...documentReady,
    notice_status: "COMPLETED",
    notice_completed_at: "2026-08-20T05:00:00.000Z",
    social_status: "PENDING_APPROVAL",
    is_closed: false
  };

  assert.equal(isReadyForExecution({ is_closed: false }), false);
  assert.equal(isReadyForExecution(awaitingSocial), false);
  assert.equal(isReadyForExecution({ ...awaitingSocial, social_status: "POSTED" }), true);
  assert.equal(isReadyForExecution({ ...awaitingSocial, social_posted_at: "2026-08-20T06:00:00.000Z" }), true);
  assert.equal(isReadyForExecution({ ...awaitingSocial, social_status: "POSTED", is_closed: true }), false);
  assert.equal(isReadyForExecution({ ...awaitingSocial, social_status: "DRAFT", social_posted_at: null }), false);
  assert.equal(isReadyForExecution({ social_status: "POSTED", is_closed: false }), true);
});

test("scheduled notice enters the action queue on its Bangkok due date and stays overdue", () => {
  const job = {
    ...documentReady,
    outage_date: "2026-10-12",
    notice_status: "SCHEDULED",
    notice_date: "2026-10-02",
    document_delivered_at: "2026-09-28T05:00:00Z"
  };

  assert.equal(isJobActionableNow(job, new Date("2026-09-29T12:00:00Z")), false);
  assert.equal(isJobActionableNow(job, new Date("2026-10-01T16:59:59Z")), false);
  assert.equal(isJobActionableNow(job, new Date("2026-10-01T17:00:00Z")), true);
  assert.equal(isJobActionableNow(job, new Date("2026-10-03T12:00:00Z")), true);
  assert.equal(getDocumentWorkflowAction(job), "COMPLETE_NOTICE");
  assert.equal(isJobActionableNow({ ...job, notice_status: "COMPLETED" }, new Date("2026-10-02T12:00:00Z")), false);
  assert.equal(isJobActionableNow({ ...job, notice_date: null }, new Date("2026-09-29T12:00:00Z")), true);
});

test("completed notice follows the recommendation and the next Social round", () => {
  const job = {
    ...documentReady,
    outage_date: "2026-10-12",
    notice_status: "COMPLETED",
    notice_completed_at: "2026-10-02T05:00:00Z",
    social_status: "DRAFT",
    is_closed: false
  };

  assert.equal(isJobActionableNow(job, new Date("2026-10-02T12:00:00Z")), false);
  assert.equal(isJobActionableNow(job, new Date("2026-10-04T16:59:59Z")), false);
  assert.equal(isJobActionableNow(job, new Date("2026-10-04T17:00:00Z")), true);
  assert.equal(isJobActionableNow(job, new Date("2026-10-06T12:00:00Z")), false);
  assert.equal(isJobActionableNow(job, new Date("2026-10-09T12:00:00Z")), true);
  assert.equal(isJobActionableNow(job, new Date("2026-10-10T12:00:00Z")), true);
  assert.equal(getDocumentWorkflowAction(job), "POST_SOCIAL");
  assert.equal(isJobActionableNow({ ...job, social_status: "POSTED" }), false);
  assert.equal(isReadyForExecution({ ...job, social_status: "POSTED" }), true);
  assert.equal(isJobActionableNow({ ...job, is_closed: true }), false);
});

test("document preparation remains actionable", () => {
  const received = "2026-09-28T05:00:00Z";
  const now = new Date("2026-09-29T12:00:00Z");
  assert.equal(isJobActionableNow({}, now), true);
  assert.equal(isJobActionableNow(documentReady, now), true);
  assert.equal(isJobActionableNow({ ...documentReady, document_received_at: received }, now), true);
  assert.equal(isJobActionableNow({ ...documentReady, document_received_at: received, document_delivered_at: received }, now), true);
});

test("queue resolver separates waiting notice, due and overdue notice", () => {
  const job = {
    outage_date: "2026-10-12",
    document_delivered_at: "2026-09-28T05:00:00Z",
    notice_status: "SCHEDULED",
    notice_date: "2026-10-02"
  };
  const waiting = getJobQueueState(job, new Date("2026-09-29T12:00:00Z"));
  assert.deepEqual(waiting, { kind: "WAITING_FOR_TIME", reason: "NOTICE", nextActionDate: "2026-10-02" });
  if (waiting.kind === "WAITING_FOR_TIME") {
    assert.match(getWaitingForTimeLabel(waiting), /รอแจกหนังสือ.*02 ต\.ค\. 69/);
  }
  assert.equal(getJobQueueState(job, new Date("2026-10-01T17:00:00Z")).kind, "ACTIONABLE_NOW");
  assert.equal(getJobQueueState(job, new Date("2026-10-03T12:00:00Z")).kind, "ACTIONABLE_NOW");
  assert.equal(getJobQueueState({ ...job, notice_date: null }, new Date("2026-09-29T12:00:00Z")).kind, "ACTIONABLE_NOW");
});

test("queue resolver separates waiting Social, due Social, ready and closed", () => {
  const job = {
    outage_date: "2026-10-12",
    notice_status: "COMPLETED",
    notice_completed_at: "2026-10-02T05:00:00Z",
    social_status: "DRAFT",
    is_closed: false
  };
  const waiting = getJobQueueState(job, new Date("2026-10-02T12:00:00Z"));
  assert.deepEqual(waiting, { kind: "WAITING_FOR_TIME", reason: "SOCIAL", nextActionDate: "2026-10-05" });
  if (waiting.kind === "WAITING_FOR_TIME") {
    assert.match(getWaitingForTimeLabel(waiting), /รอโพสต์ Social.*05 ต\.ค\. 69/);
  }
  assert.equal(getJobQueueState(job, new Date("2026-10-04T17:00:00Z")).kind, "ACTIONABLE_NOW");
  assert.deepEqual(getJobQueueState(job, new Date("2026-10-06T12:00:00Z")), { kind: "WAITING_FOR_TIME", reason: "SOCIAL", nextActionDate: "2026-10-09" });
  assert.equal(getJobQueueState({ ...job, social_status: "POSTED" }).kind, "READY_FOR_OPERATION");
  assert.equal(getJobQueueState({ ...job, is_closed: true }).kind, "CLOSED");
  assert.equal(getJobQueueState({ notice_status: "COMPLETED", outage_date: null }).kind, "ACTIONABLE_NOW");
});
