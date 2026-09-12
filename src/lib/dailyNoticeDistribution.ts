import { createHash } from "node:crypto";
import {
  buildOutageNoticeLineMessage,
  type OutageNoticeMessageJob
} from "./outageNoticeMessage.ts";
import { normalizeDateOnly } from "./reminder.ts";
import { getDistributionWorkflow } from "./distributionWorkflow.ts";

export const NOTICE_DISTRIBUTION_EVENT_TYPE = "NOTICE_DISTRIBUTION";

export type NoticeDistributionJob = OutageNoticeMessageJob & {
  id: number | string;
  equipment_code?: string | null;
  notice_date?: string | null;
  notice_status?: string | null;
  notice_completed_at?: string | null;
  is_closed?: boolean | null;
};

export type NoticeDistributionPushResult = {
  ok: boolean;
  status: number;
  body: string;
  requestId?: string | null;
};

export type NoticeDistributionRunSummary = {
  ok: boolean;
  totalRowsChecked: number;
  matched: number;
  sent: number;
  skipped: number;
  skipReasons: Record<string, number>;
  lineSendAttempts: number;
  lineSendFailures: number;
  logged: number;
  errors: Array<{ id?: number | string; error: string }>;
};

export type ProcessNoticeDistributionInput = {
  jobs: NoticeDistributionJob[];
  targetDate: string;
  dryRun: boolean;
  sentEventKeys?: Iterable<string>;
  pushMessage: (input: {
    job: NoticeDistributionJob;
    message: string;
    eventKey: string;
    retryKey: string;
  }) => Promise<NoticeDistributionPushResult>;
  recordSentEvent: (input: {
    job: NoticeDistributionJob;
    eventKey: string;
    targetDate: string;
    requestId: string | null;
  }) => Promise<void>;
};

export function buildNoticeDistributionEventKey(
  jobId: number | string,
  targetDate: string
) {
  return `${NOTICE_DISTRIBUTION_EVENT_TYPE}:${jobId}:${targetDate}`;
}

/**
 * LINE requires a UUID-form retry key. Deriving it from the event key makes
 * concurrent cron invocations use the same key before the database log exists.
 */
export function buildLineRetryKey(eventKey: string): string {
  const bytes = createHash("sha256").update(eventKey).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getNoticeDistributionSkipReason(
  job: NoticeDistributionJob,
  targetDate: string
): string | null {
  if (job.is_closed) return "is_closed=true";

  const noticeStatus = job.notice_status?.trim().toUpperCase();
  if (
    job.notice_completed_at ||
    noticeStatus === "COMPLETED" ||
    noticeStatus === "SENT"
  ) {
    return "notice_already_completed";
  }

  if (!getDistributionWorkflow(job).reminderEligible) {
    return "not_operations_distribution";
  }

  if (normalizeDateOnly(job.notice_date) !== targetDate) {
    return "notice_date_not_match";
  }

  return null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function processNoticeDistributionJobs(
  input: ProcessNoticeDistributionInput
): Promise<NoticeDistributionRunSummary> {
  const summary: NoticeDistributionRunSummary = {
    ok: true,
    totalRowsChecked: input.jobs.length,
    matched: 0,
    sent: 0,
    skipped: 0,
    skipReasons: {},
    lineSendAttempts: 0,
    lineSendFailures: 0,
    logged: 0,
    errors: []
  };
  const sentEventKeys = new Set(input.sentEventKeys ?? []);

  const addSkipReason = (reason: string) => {
    summary.skipped += 1;
    summary.skipReasons[reason] = (summary.skipReasons[reason] ?? 0) + 1;
  };

  for (const job of input.jobs) {
    const eligibilityReason = getNoticeDistributionSkipReason(
      job,
      input.targetDate
    );
    if (eligibilityReason) {
      addSkipReason(eligibilityReason);
      continue;
    }

    const eventKey = buildNoticeDistributionEventKey(job.id, input.targetDate);
    if (sentEventKeys.has(eventKey)) {
      addSkipReason("already_notified_today");
      continue;
    }

    summary.matched += 1;
    if (input.dryRun) {
      addSkipReason("dry_run_no_send");
      continue;
    }

    let message: string;
    try {
      // This is intentionally the same builder used by the Jobs modal preview
      // and clipboard actions.
      message = buildOutageNoticeLineMessage(job);
    } catch (error) {
      summary.ok = false;
      summary.errors.push({
        id: job.id,
        error: `Unable to build notice-distribution message: ${errorMessage(error)}`
      });
      addSkipReason("message_build_failed");
      continue;
    }

    summary.lineSendAttempts += 1;
    let lineResult: NoticeDistributionPushResult;
    try {
      lineResult = await input.pushMessage({
        job,
        message,
        eventKey,
        retryKey: buildLineRetryKey(eventKey)
      });
    } catch (error) {
      lineResult = {
        ok: false,
        status: 0,
        body: errorMessage(error)
      };
    }

    if (!lineResult.ok) {
      summary.ok = false;
      summary.lineSendFailures += 1;
      summary.errors.push({
        id: job.id,
        error: `LINE push failed (${lineResult.status}): ${lineResult.body}`
      });
      addSkipReason("line_push_failed");
      continue;
    }

    summary.sent += 1;
    try {
      await input.recordSentEvent({
        job,
        eventKey,
        targetDate: input.targetDate,
        requestId: lineResult.requestId ?? null
      });
      sentEventKeys.add(eventKey);
      summary.logged += 1;
    } catch (error) {
      summary.ok = false;
      summary.errors.push({
        id: job.id,
        error: `LINE was accepted but notification log failed: ${errorMessage(error)}`
      });
      addSkipReason("notification_log_failed");
    }
  }

  return summary;
}
