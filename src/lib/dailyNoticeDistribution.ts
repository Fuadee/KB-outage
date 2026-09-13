import { createHash } from "node:crypto";
import {
  buildOutageNoticeLineMessage,
  type OutageNoticeMessageJob
} from "./outageNoticeMessage.ts";
import { normalizeDateOnly } from "./reminder.ts";
import { getDistributionWorkflow } from "./distributionWorkflow.ts";
import { getDistributionDueDate } from "./distributionReminder.ts";

export const NOTICE_DISTRIBUTION_EVENT_TYPE = "NOTICE_DISTRIBUTION";

export type NoticeDistributionJob = OutageNoticeMessageJob & {
  id: number | string;
  equipment_code?: string | null;
  notice_date?: string | null;
  notice_status?: string | null;
  notice_scheduled_at?: string | null;
  notice_completed_at?: string | null;
  notice_completion_source?: string | null;
  document_received_at?: string | null;
  document_delivered_at?: string | null;
  social_status?: string | null;
  social_posted_at?: string | null;
  is_closed?: boolean | null;
};

export type NoticeDistributionCompletionReason =
  | "user_confirmed_notice_completion"
  | null;

export type NoticeDistributionIgnoredCompletionEvidence =
  | "legacy_sent_status"
  | "legacy_migration_backfill"
  | "missing_user_completion_provenance"
  | "incomplete_user_completion_evidence"
  | null;

export type NoticeDistributionCompletionEvaluation = {
  completed: boolean;
  completionReason: NoticeDistributionCompletionReason;
  ignoredEvidence: NoticeDistributionIgnoredCompletionEvidence;
};

export type NoticeDistributionDueDateSource =
  | "notice_date"
  | "outage_date_fallback"
  | null;

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

/**
 * Only explicit provenance from the Jobs completion action is accepted.
 * Migration 023 and real user completion can produce identical timestamps,
 * so timestamp relationships must never be used to distinguish them.
 */
export function evaluateNoticeDistributionCompletion(
  job: NoticeDistributionJob
): NoticeDistributionCompletionEvaluation {
  const noticeStatus = job.notice_status?.trim().toUpperCase();
  const completionSource = job.notice_completion_source?.trim().toUpperCase();
  const hasCompletedAt = Boolean(job.notice_completed_at?.trim());

  if (
    completionSource === "USER" &&
    noticeStatus === "COMPLETED" &&
    hasCompletedAt
  ) {
    return {
      completed: true,
      completionReason: "user_confirmed_notice_completion",
      ignoredEvidence: null
    };
  }

  if (completionSource === "LEGACY_BACKFILL") {
    return {
      completed: false,
      completionReason: null,
      ignoredEvidence: "legacy_migration_backfill"
    };
  }

  if (noticeStatus === "SENT") {
    return {
      completed: false,
      completionReason: null,
      ignoredEvidence: "legacy_sent_status"
    };
  }

  const hasCompletionShapedData =
    noticeStatus === "COMPLETED" || hasCompletedAt || completionSource === "USER";
  return {
    completed: false,
    completionReason: null,
    ignoredEvidence: hasCompletionShapedData
      ? completionSource === "USER"
        ? "incomplete_user_completion_evidence"
        : "missing_user_completion_provenance"
      : null
  };
}

export function getNoticeDistributionCompletionReason(
  job: NoticeDistributionJob
): NoticeDistributionCompletionReason {
  return evaluateNoticeDistributionCompletion(job).completionReason;
}

/**
 * The Jobs card uses the explicitly scheduled notice date when present and
 * otherwise derives the operational deadline from the outage date. Daily LINE
 * must use the same rule so an unscheduled job does not disappear at the DB
 * boundary merely because notice_date is null.
 */
export function resolveNoticeDistributionDueDate(
  job: NoticeDistributionJob
): { dueDate: string | null; source: NoticeDistributionDueDateSource } {
  const noticeDate = normalizeDateOnly(job.notice_date);
  if (noticeDate) {
    return { dueDate: noticeDate, source: "notice_date" };
  }

  const fallbackDate = getDistributionDueDate(job.outage_date);
  return {
    dueDate: fallbackDate,
    source: fallbackDate ? "outage_date_fallback" : null
  };
}

/**
 * Mirrors every effective query condition, including the exact-date fallback
 * that cannot be represented reliably as a simple PostgREST date comparison.
 * Completion is intentionally not a query filter so completed jobs still emit
 * a diagnostic explaining why they were skipped.
 */
export function matchesNoticeDistributionQuery(
  job: NoticeDistributionJob,
  targetDate: string
): boolean {
  if (job.is_closed) return false;
  if (getDistributionWorkflow(job).route !== "OPERATIONS") return false;

  const { dueDate } = resolveNoticeDistributionDueDate(job);
  return Boolean(dueDate && dueDate <= targetDate);
}

export function getNoticeDistributionSkipReason(
  job: NoticeDistributionJob,
  targetDate: string
): string | null {
  if (job.is_closed) return "is_closed=true";

  if (getNoticeDistributionCompletionReason(job)) {
    return "notice_already_completed";
  }

  // Use the shared resolver only for the responsible-unit route. Its broader
  // UI workflow completion state must not decide this daily reminder.
  if (getDistributionWorkflow(job).route !== "OPERATIONS") {
    return "not_operations_distribution";
  }

  const { dueDate } = resolveNoticeDistributionDueDate(job);
  if (!dueDate || dueDate > targetDate) {
    return "notice_date_not_match";
  }

  return null;
}

export function buildNoticeDistributionDiagnostic(
  job: NoticeDistributionJob,
  targetDate: string
) {
  const completion = evaluateNoticeDistributionCompletion(job);
  const dueDate = resolveNoticeDistributionDueDate(job);
  return {
    jobId: job.id,
    equipmentCode: job.equipment_code ?? null,
    noticeDate: job.notice_date ?? null,
    effectiveNoticeDate: dueDate.dueDate,
    noticeDateSource: dueDate.source,
    noticeCompletedAt: job.notice_completed_at ?? null,
    noticeCompletionSource: job.notice_completion_source ?? null,
    noticeStatus: job.notice_status ?? null,
    noticeScheduledAt: job.notice_scheduled_at ?? null,
    documentReceivedAt: job.document_received_at ?? null,
    documentDeliveredAt: job.document_delivered_at ?? null,
    socialStatus: job.social_status ?? null,
    socialPostedAt: job.social_posted_at ?? null,
    responsibleUnit: job.responsible_unit ?? null,
    isClosed: job.is_closed ?? null,
    completionReason: completion.completionReason,
    completionEvidence: {
      noticeStatus: job.notice_status ?? null,
      hasNoticeCompletedAt: Boolean(job.notice_completed_at?.trim()),
      noticeCompletionSource: job.notice_completion_source ?? null
    },
    ignoredEvidence: completion.ignoredEvidence,
    eligibilityReason: getNoticeDistributionSkipReason(job, targetDate)
  };
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
