import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildLineRetryKey,
  buildNoticeDistributionDiagnostic,
  buildNoticeDistributionEventKey,
  getNoticeDistributionCompletionReason,
  getNoticeDistributionSkipReason,
  processNoticeDistributionJobs,
  type NoticeDistributionJob
} from "./dailyNoticeDistribution.ts";
import { computeBangkokTodayDateOnly } from "./reminder.ts";
import { buildOutageNoticeLineMessage } from "./outageNoticeMessage.ts";

const targetDate = "2026-09-12";

function makeJob(
  id: string,
  patch: Partial<NoticeDistributionJob> = {}
): NoticeDistributionJob {
  return {
    id,
    equipment_code: `KBB-${id}`,
    outage_date: "2026-09-16",
    responsible_unit: "แผนกปฏิบัติการ",
    customer_count: 300,
    doc_area_title: `พื้นที่ ${id}`,
    doc_purpose: null,
    doc_area_detail: null,
    map_link: "https://example.com/map",
    notice_date: targetDate,
    notice_status: "SCHEDULED",
    notice_completed_at: null,
    notice_completion_source: null,
    is_closed: false,
    ...patch
  };
}

function createHarness(sentEvents = new Set<string>()) {
  const messages: string[] = [];
  const recorded: string[] = [];
  return {
    sentEventKeys: sentEvents,
    messages,
    recorded,
    pushMessage: async ({ message }: { message: string }) => {
      messages.push(message);
      return { ok: true, status: 200, body: "", requestId: "line-request" };
    },
    recordSentEvent: async ({ eventKey }: { eventKey: string }) => {
      recorded.push(eventKey);
      sentEvents.add(eventKey);
    }
  };
}

test("no distribution jobs means no LINE message", async () => {
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 0);
  assert.equal(harness.messages.length, 0);
});

test("a scheduled distribution today sends and logs one message", async () => {
  const job = makeJob("a");
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [job],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 1);
  assert.equal(summary.logged, 1);
  assert.equal(harness.messages[0], buildOutageNoticeLineMessage(job));
  assert.deepEqual(harness.recorded, [
    buildNoticeDistributionEventKey(job.id, targetDate)
  ]);
});

test("dry run reports a match without sending or logging", async () => {
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [makeJob("dry")],
    targetDate,
    dryRun: true,
    ...harness
  });

  assert.equal(summary.matched, 1);
  assert.equal(summary.sent, 0);
  assert.equal(summary.skipReasons.dry_run_no_send, 1);
  assert.equal(harness.messages.length, 0);
  assert.equal(harness.recorded.length, 0);
});

test("a pending distribution due before today is sent", async () => {
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [makeJob("yesterday", { notice_date: "2026-09-11" })],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 1);
  assert.equal(summary.matched, 1);
});

test("a pending distribution overdue by several days is sent", async () => {
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [makeJob("overdue", { notice_date: "2026-09-01" })],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 1);
  assert.equal(summary.matched, 1);
});

test("a future distribution is not sent", async () => {
  const tomorrow = makeJob("tomorrow", { notice_date: "2026-09-13" });
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [tomorrow],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 0);
  assert.equal(summary.skipReasons.notice_date_not_match, 1);
});

test("a distribution without a notice date is not sent", async () => {
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [makeJob("missing-date", { notice_date: null })],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 0);
  assert.equal(summary.skipReasons.notice_date_not_match, 1);
});

test("receiving the physical document does not complete distribution", () => {
  assert.equal(
    getNoticeDistributionSkipReason(
      makeJob("received", {
        notice_date: "2026-09-10",
        notice_status: "NONE",
        document_received_at: "2026-09-09T02:00:00.000Z"
      }),
      targetDate
    ),
    null
  );
});

test("sending the physical document to its distributor does not complete distribution", () => {
  assert.equal(
    getNoticeDistributionSkipReason(
      makeJob("document-sent", {
        notice_date: "2026-09-10",
        notice_status: "NONE",
        document_received_at: "2026-09-09T02:00:00.000Z",
        document_delivered_at: "2026-09-09T03:00:00.000Z"
      }),
      targetDate
    ),
    null
  );
});

test("the current distribution step is still pending", () => {
  assert.equal(
    getNoticeDistributionSkipReason(
      makeJob("distribution-step", {
        notice_date: "2026-09-10",
        notice_status: "SCHEDULED",
        document_delivered_at: "2026-09-09T03:00:00.000Z"
      }),
      targetDate
    ),
    null
  );
});

test("legacy SENT is a workflow progress status, not distribution completion", () => {
  const job = makeJob("legacy-sent", {
    notice_date: "2026-09-10",
    notice_status: "SENT"
  });

  assert.equal(getNoticeDistributionCompletionReason(job), null);
  assert.equal(getNoticeDistributionSkipReason(job, targetDate), null);
});

test("COMPLETED status without the completion timestamp is not proof of distribution", () => {
  const job = makeJob("status-only", {
    notice_date: "2026-09-10",
    notice_status: "COMPLETED",
    notice_completed_at: null,
    notice_completion_source: "USER"
  });

  assert.equal(getNoticeDistributionCompletionReason(job), null);
  assert.equal(getNoticeDistributionSkipReason(job, targetDate), null);
});

test("a legacy migration-only completed row is not actual completion", async () => {
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [
      makeJob("legacy-backfill", {
        equipment_code: "KBB05WF-LEGACY",
        notice_date: "2026-09-09",
        notice_status: "COMPLETED",
        notice_scheduled_at: "2026-09-09T10:02:36.944+07:00",
        notice_completed_at: "2026-09-09T10:02:36.944+07:00",
        notice_completion_source: "LEGACY_BACKFILL"
      })
    ],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 1);
  assert.equal(summary.skipReasons.notice_already_completed, undefined);
});

test("an overdue actually completed distribution is not sent", async () => {
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [
      makeJob("actual-completion", {
        notice_date: "2026-09-10",
        notice_status: "COMPLETED",
        notice_completed_at: "2026-09-12T02:00:00.000Z",
        notice_completion_source: "USER"
      })
    ],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 0);
  assert.equal(summary.skipReasons.notice_already_completed, 1);
});

test("KBB05WF-104 actual completion is skipped even when completion and schedule timestamps match", async () => {
  const harness = createHarness();
  const job = makeJob("198af120-342e-41ec-9bfd-45c7c3e9edfc", {
    equipment_code: "KBB05WF-104",
    notice_date: "2026-09-09",
    notice_status: "COMPLETED",
    notice_scheduled_at: "2026-09-09T10:02:36.944+07:00",
    notice_completed_at: "2026-09-09T10:02:36.944+07:00",
    notice_completion_source: "USER",
    document_received_at: "2026-09-02T13:42:00+07:00",
    document_delivered_at: "2026-09-07T14:01:00+07:00",
    social_status: "POSTED",
    social_posted_at: "2026-09-11T10:37:57.385+07:00"
  });
  const summary = await processNoticeDistributionJobs({
    jobs: [job],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(getNoticeDistributionCompletionReason(job), "user_confirmed_notice_completion");
  assert.equal(getNoticeDistributionSkipReason(job, targetDate), "notice_already_completed");
  assert.equal(summary.sent, 0);
  assert.equal(summary.skipReasons.notice_already_completed, 1);
  assert.equal(harness.messages.length, 0);
});

test("safe diagnostic identifies the exact completion field without customer data", () => {
  const diagnostic = buildNoticeDistributionDiagnostic(
    makeJob("diagnostic", {
      notice_date: "2026-09-10",
      notice_status: "COMPLETED",
      notice_completed_at: "2026-09-12T02:00:00.000Z",
      notice_completion_source: "USER",
      document_received_at: "2026-09-09T02:00:00.000Z",
      document_delivered_at: "2026-09-09T03:00:00.000Z"
    }),
    targetDate
  );

  assert.equal(diagnostic.completionReason, "user_confirmed_notice_completion");
  assert.deepEqual(diagnostic.completionEvidence, {
    noticeStatus: "COMPLETED",
    hasNoticeCompletedAt: true,
    noticeCompletionSource: "USER"
  });
  assert.equal(diagnostic.ignoredEvidence, null);
  assert.equal(diagnostic.eligibilityReason, "notice_already_completed");
  assert.equal(diagnostic.jobId, "diagnostic");
  assert.equal(diagnostic.equipmentCode, "KBB-diagnostic");
  assert.equal("customer_count" in diagnostic, false);
  assert.equal("doc_area_title" in diagnostic, false);
  assert.equal("map_link" in diagnostic, false);
});

test("an overdue closed job is not sent", async () => {
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [
      makeJob("closed", { notice_date: "2026-09-10", is_closed: true })
    ],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 0);
  assert.equal(summary.skipReasons["is_closed=true"], 1);
});

test("overdue construction and Ao Nang jobs never enter the shift 1 reminder flow", async () => {
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [
      makeJob("construction", {
        notice_date: "2026-09-10",
        responsible_unit: "แผนกก่อสร้าง"
      }),
      makeJob("ao-nang", {
        notice_date: "2026-09-10",
        responsible_unit: "กฟส.อ่าวนาง"
      })
    ],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 0);
  assert.equal(summary.skipReasons.not_operations_distribution, 2);
  assert.equal(harness.messages.length, 0);
});

test("a historical operations date stops after changing to construction", () => {
  assert.equal(
    getNoticeDistributionSkipReason(
      makeJob("changed-unit", { responsible_unit: "แผนกก่อสร้าง" }),
      targetDate
    ),
    "not_operations_distribution"
  );
});

test("three due jobs produce three independent messages", async () => {
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [makeJob("a"), makeJob("b"), makeJob("c")],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 3);
  assert.equal(harness.messages.length, 3);
  assert.equal(harness.recorded.length, 3);
});

test("retrying an overdue job on the same day does not send twice", async () => {
  const sentEvents = new Set<string>();
  const first = createHarness(sentEvents);
  await processNoticeDistributionJobs({
    jobs: [makeJob("same", { notice_date: "2026-09-10" })],
    targetDate,
    dryRun: false,
    ...first
  });

  const second = createHarness(sentEvents);
  const summary = await processNoticeDistributionJobs({
    jobs: [makeJob("same", { notice_date: "2026-09-10" })],
    targetDate,
    dryRun: false,
    ...second
  });

  assert.equal(summary.sent, 0);
  assert.equal(summary.skipReasons.already_notified_today, 1);
  assert.equal(second.messages.length, 0);
});

test("an overdue pending job can be notified again on the next day", async () => {
  const job = makeJob("next-day", { notice_date: "2026-09-10" });
  const sentEvents = new Set<string>();
  const first = createHarness(sentEvents);
  await processNoticeDistributionJobs({
    jobs: [job],
    targetDate,
    dryRun: false,
    ...first
  });

  const nextDate = "2026-09-13";
  const nextDay = createHarness(sentEvents);
  const summary = await processNoticeDistributionJobs({
    jobs: [job],
    targetDate: nextDate,
    dryRun: false,
    ...nextDay
  });

  assert.equal(summary.sent, 1);
  assert.deepEqual(nextDay.recorded, [
    buildNoticeDistributionEventKey(job.id, nextDate)
  ]);
});

test("a failed LINE job is not logged and does not stop the next job", async () => {
  const recorded: string[] = [];
  const summary = await processNoticeDistributionJobs({
    jobs: [makeJob("a"), makeJob("b")],
    targetDate,
    dryRun: false,
    pushMessage: async ({ job }) =>
      job.id === "a"
        ? { ok: false, status: 500, body: "LINE unavailable" }
        : { ok: true, status: 200, body: "" },
    recordSentEvent: async ({ eventKey }) => {
      recorded.push(eventKey);
    }
  });

  assert.equal(summary.lineSendFailures, 1);
  assert.equal(summary.ok, false);
  assert.equal(summary.sent, 1);
  assert.deepEqual(recorded, [
    buildNoticeDistributionEventKey("b", targetDate)
  ]);
});

test("missing optional Job data uses the shared UI fallbacks", async () => {
  const harness = createHarness();
  const job = makeJob("legacy", {
    customer_count: null,
    doc_area_title: null,
    doc_purpose: null,
    map_link: null
  });
  const summary = await processNoticeDistributionJobs({
    jobs: [job],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 1);
  assert.match(harness.messages[0], /ไม่ระบุพื้นที่/);
  assert.match(harness.messages[0], /จำนวนหนังสือ: ไม่ระบุ ราย/);
  assert.match(harness.messages[0], /แผนที่: ไม่มีข้อมูลแผนที่/);
});

test("Bangkok date is correct across the UTC day boundary", () => {
  assert.equal(
    computeBangkokTodayDateOnly(new Date("2026-09-11T17:30:00.000Z")),
    "2026-09-12"
  );
});

test("LINE retry key is a stable UUID derived from the event", () => {
  const eventKey = buildNoticeDistributionEventKey("abc", targetDate);
  const retryKey = buildLineRetryKey(eventKey);

  assert.equal(retryKey, buildLineRetryKey(eventKey));
  assert.match(
    retryKey,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});

test("manual preview and daily notification use the same builder", () => {
  const service = readFileSync(
    new URL("./dailyNoticeDistribution.ts", import.meta.url),
    "utf8"
  );
  const modal = readFileSync(
    new URL("../components/NoticeScheduleModal.tsx", import.meta.url),
    "utf8"
  );
  const migration = readFileSync(
    new URL("../../sql/024_notice_distribution_line_notifications.sql", import.meta.url),
    "utf8"
  );
  const cronService = readFileSync(
    new URL("./sameDayReminderService.ts", import.meta.url),
    "utf8"
  );
  const provenanceMigration = readFileSync(
    new URL("../../sql/026_notice_completion_provenance.sql", import.meta.url),
    "utf8"
  );
  const completionRoute = readFileSync(
    new URL("../app/api/jobs/[id]/notice-completion/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(service, /buildOutageNoticeLineMessage\(job\)/);
  assert.match(service, /completionReason: "user_confirmed_notice_completion"/);
  assert.match(service, /ignoredEvidence: "legacy_migration_backfill"/);
  assert.match(service, /ignoredEvidence: "legacy_sent_status"/);
  assert.match(modal, /buildOutageNoticeLineMessage\(job\)/);
  assert.match(completionRoute, /notice_status: "COMPLETED"/);
  assert.match(completionRoute, /notice_completed_at: completedAt/);
  assert.match(completionRoute, /notice_completion_source: "USER"/);
  assert.match(migration, /event_key text primary key/);
  assert.match(migration, /line_notification_events/);
  assert.doesNotMatch(migration, /notice_completed_at\s*=/);
  assert.match(provenanceMigration, /notice_completion_source = 'LEGACY_BACKFILL'/);
  assert.match(provenanceMigration, /equipment_code = 'KBB05WF-104'/);
  assert.match(provenanceMigration, /notice_completion_source = 'USER'/);
  assert.match(cronService, /processNoticeDistributionJobs\(/);
  assert.match(cronService, /notice-distribution-job-diagnostic/);
  assert.match(cronService, /\.lte\("notice_date", targetDate\)/);
  assert.doesNotMatch(cronService, /\.eq\("notice_date", targetDate\)/);
  assert.match(cronService, /\.eq\("responsible_unit", "แผนกปฏิบัติการ"\)/);
  assert.match(cronService, /X-Line-Retry-Key/);
  assert.match(cronService, /error\.code !== "23505"/);
  assert.match(cronService, /same-day-reminder-boundary-started/);
  assert.match(cronService, /same-day-reminder-dependency-http-failed/);
  assert.match(cronService, /notice_distribution\.notification_log_insert/);
  assert.match(cronService, /runIndependentReminderFlows\(/);
  assert.match(cronService, /daily-line-reminder-flow-started/);
  assert.match(cronService, /daily-line-reminder-flow-failed/);
  assert.ok(
    cronService.indexOf("same-day-reminder-original-flow-completed") <
      cronService.indexOf('boundary: "notice_distribution.query_jobs"'),
    "the original same-day flow must finish before notice distribution starts"
  );
  assert.doesNotMatch(cronService, /AbortSignal\.timeout|AbortController|5_000|5000/);
});

test("eligibility uses the planned date, never the outage date", () => {
  assert.equal(
    getNoticeDistributionSkipReason(
      makeJob("different-outage", { outage_date: "2026-09-30" }),
      targetDate
    ),
    null
  );
});
