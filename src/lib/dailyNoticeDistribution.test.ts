import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildLineRetryKey,
  buildNoticeDistributionEventKey,
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

test("tomorrow and yesterday are not sent by today's run", async () => {
  const tomorrow = makeJob("tomorrow", { notice_date: "2026-09-13" });
  const yesterday = makeJob("yesterday", { notice_date: "2026-09-11" });
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [tomorrow, yesterday],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 0);
  assert.equal(summary.skipReasons.notice_date_not_match, 2);
});

test("completed or closed distribution jobs are not sent", async () => {
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [
      makeJob("status-complete", { notice_status: "COMPLETED" }),
      makeJob("timestamp-complete", {
        notice_completed_at: "2026-09-12T02:00:00.000Z"
      }),
      makeJob("closed", { is_closed: true })
    ],
    targetDate,
    dryRun: false,
    ...harness
  });

  assert.equal(summary.sent, 0);
  assert.equal(summary.skipReasons.notice_already_completed, 2);
  assert.equal(summary.skipReasons["is_closed=true"], 1);
});

test("construction and Ao Nang never enter the shift 1 reminder flow", async () => {
  const harness = createHarness();
  const summary = await processNoticeDistributionJobs({
    jobs: [
      makeJob("construction", { responsible_unit: "แผนกก่อสร้าง" }),
      makeJob("ao-nang", { responsible_unit: "กฟส.อ่าวนาง" })
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

test("a repeated run skips the same job by stable event key", async () => {
  const sentEvents = new Set<string>();
  const first = createHarness(sentEvents);
  await processNoticeDistributionJobs({
    jobs: [makeJob("same")],
    targetDate,
    dryRun: false,
    ...first
  });

  const second = createHarness(sentEvents);
  const summary = await processNoticeDistributionJobs({
    jobs: [makeJob("same")],
    targetDate,
    dryRun: false,
    ...second
  });

  assert.equal(summary.sent, 0);
  assert.equal(summary.skipReasons.already_notified_today, 1);
  assert.equal(second.messages.length, 0);
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

  assert.match(service, /buildOutageNoticeLineMessage\(job\)/);
  assert.match(modal, /buildOutageNoticeLineMessage\(job\)/);
  assert.match(migration, /event_key text primary key/);
  assert.match(migration, /line_notification_events/);
  assert.doesNotMatch(migration, /notice_completed_at\s*=/);
  assert.match(cronService, /processNoticeDistributionJobs\(/);
  assert.match(cronService, /\.eq\("notice_date", targetDate\)/);
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
