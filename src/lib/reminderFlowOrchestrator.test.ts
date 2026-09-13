import assert from "node:assert/strict";
import test from "node:test";
import { runIndependentReminderFlows } from "./reminderFlowOrchestrator.ts";

type TestSummary = {
  ok: boolean;
  sent: number;
  errors: Array<{ error: string }>;
};

const success = (sent = 1): TestSummary => ({ ok: true, sent, errors: [] });
const failed = (error: unknown): TestSummary => ({
  ok: false,
  sent: 0,
  errors: [{ error: error instanceof Error ? error.message : String(error) }]
});

async function runScenario(input: {
  sameDay: () => Promise<TestSummary>;
  distribution: () => Promise<TestSummary>;
}) {
  const calls: string[] = [];
  const result = await runIndependentReminderFlows({
    sameDayReminder: {
      run: async () => {
        calls.push("sameDayReminder");
        return input.sameDay();
      },
      failedSummary: failed
    },
    noticeDistribution: {
      run: async () => {
        calls.push("noticeDistribution");
        return input.distribution();
      },
      failedSummary: failed
    }
  });
  return { calls, result };
}

test("both reminder flows succeed", async () => {
  const { calls, result } = await runScenario({
    sameDay: async () => success(),
    distribution: async () => success()
  });

  assert.deepEqual(calls, ["sameDayReminder", "noticeDistribution"]);
  assert.equal(result.sameDayReminder.ok, true);
  assert.equal(result.noticeDistribution.ok, true);
});

test("same-day failure does not stop notice distribution", async () => {
  const { calls, result } = await runScenario({
    sameDay: async () => {
      throw new Error("same-day failed");
    },
    distribution: async () => success()
  });

  assert.deepEqual(calls, ["sameDayReminder", "noticeDistribution"]);
  assert.equal(result.sameDayReminder.ok, false);
  assert.equal(result.noticeDistribution.ok, true);
});

test("notice-distribution failure does not change same-day success", async () => {
  const { calls, result } = await runScenario({
    sameDay: async () => success(),
    distribution: async () => {
      throw new Error("distribution failed");
    }
  });

  assert.deepEqual(calls, ["sameDayReminder", "noticeDistribution"]);
  assert.equal(result.sameDayReminder.ok, true);
  assert.equal(result.noticeDistribution.ok, false);
});

test("both reminder flow failures are returned separately", async () => {
  const { calls, result } = await runScenario({
    sameDay: async () => {
      throw new Error("same-day failed");
    },
    distribution: async () => {
      throw new Error("distribution failed");
    }
  });

  assert.deepEqual(calls, ["sameDayReminder", "noticeDistribution"]);
  assert.deepEqual(result.sameDayReminder.errors, [{ error: "same-day failed" }]);
  assert.deepEqual(result.noticeDistribution.errors, [
    { error: "distribution failed" }
  ]);
});

test("same-day Supabase 504 still invokes notice distribution", async () => {
  let distributionCalls = 0;
  const gatewayTimeout = Object.assign(new Error("Supabase gateway timeout"), {
    status: 504
  });
  const { result } = await runScenario({
    sameDay: async () => {
      throw gatewayTimeout;
    },
    distribution: async () => {
      distributionCalls += 1;
      return success();
    }
  });

  assert.equal(result.sameDayReminder.ok, false);
  assert.equal(result.noticeDistribution.ok, true);
  assert.equal(distributionCalls, 1);
});

test("endpoint retry does not send successful reminders twice", async () => {
  const delivered = new Set<string>();
  const lineSends: string[] = [];

  const runFlow = (eventKey: string) => async (): Promise<TestSummary> => {
    if (delivered.has(eventKey)) return success(0);
    lineSends.push(eventKey);
    delivered.add(eventKey);
    return success(1);
  };
  const invokeEndpoint = () =>
    runScenario({
      sameDay: runFlow("SAME_DAY_OUTAGE:job-1:2026-09-13"),
      distribution: runFlow("NOTICE_DISTRIBUTION:job-1:2026-09-13")
    });

  const first = await invokeEndpoint();
  const retry = await invokeEndpoint();

  assert.equal(first.result.sameDayReminder.sent, 1);
  assert.equal(first.result.noticeDistribution.sent, 1);
  assert.equal(retry.result.sameDayReminder.sent, 0);
  assert.equal(retry.result.noticeDistribution.sent, 0);
  assert.deepEqual(lineSends, [
    "SAME_DAY_OUTAGE:job-1:2026-09-13",
    "NOTICE_DISTRIBUTION:job-1:2026-09-13"
  ]);
});
