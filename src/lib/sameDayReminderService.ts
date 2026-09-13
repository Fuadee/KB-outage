import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  buildLineRetryKey,
  NOTICE_DISTRIBUTION_EVENT_TYPE,
  processNoticeDistributionJobs,
  type NoticeDistributionJob,
  type NoticeDistributionRunSummary
} from "@/lib/dailyNoticeDistribution";
import {
  BANGKOK_TIMEZONE,
  computeBangkokTodayDateOnly,
  formatSameDayReminderMessage,
  getReminderMissingEnvKeys,
  getReminderRuntimeReadiness,
  getSameDayReminderSkipReason,
  normalizeDateOnly,
} from "@/lib/reminder";
import { reminderConfig } from "@/lib/reminderConfig";
import {
  runIndependentReminderFlows,
  type ReminderFlowName
} from "@/lib/reminderFlowOrchestrator";
import { ensureSystemCertificateAuthorities } from "@/lib/serverTls";

export type SameDayReminderJob = {
  id: number | string;
  equipment_code: string | null;
  outage_date: string | null;
  map_link?: string | null;
  line_same_day_reminder_sent_at: string | null;
  status?: string | null;
  is_closed?: boolean | null;
};

export type SameDayReminderRunInput = {
  runId?: string;
  date?: string | null;
  dryRun?: boolean;
  trigger: "external-get" | "external-post";
};

export type SameDayReminderFlowSummary = {
  ok: boolean;
  totalRowsChecked: number;
  matched: number;
  sent: number;
  skipped: number;
  skipReasons: Record<string, number>;
  sampleRows: Array<{
    id: number | string;
    equipment_code: string | null;
    outage_date: string | null;
    status: string | null;
    line_same_day_reminder_sent_at: string | null;
  }>;
  lineSendAttempts: number;
  lineSendFailures: number;
  updatedRows: number;
  errors: Array<{ id?: number | string; error: string }>;
};

export type SameDayReminderRunSummary = {
  ok: boolean;
  runId: string;
  nowUtc: string;
  nowBangkok: string;
  targetDateUsed: string;
  dryRun: boolean;
  trigger: SameDayReminderRunInput["trigger"];
  sameDayReminder: SameDayReminderFlowSummary;
  noticeDistribution: NoticeDistributionRunSummary;
};

type ReminderDependencyService = "supabase" | "line" | "application";

type ReminderBoundary =
  | "original_same_day.query_jobs"
  | "original_same_day.line_push"
  | "original_same_day.update_sent_at"
  | "notice_distribution.query_jobs"
  | "notice_distribution.query_event_log"
  | "notice_distribution.process"
  | "notice_distribution.line_push"
  | "notice_distribution.notification_log_insert";

type ReminderBoundaryContext = {
  runId: string;
  targetDate: string;
  trigger: SameDayReminderRunInput["trigger"];
  boundary: ReminderBoundary;
  service: ReminderDependencyService;
  jobId?: number | string;
};

function sanitizeLogText(value: unknown, maxLength = 1_000): string {
  return String(value ?? "")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
    .slice(0, maxLength);
}

function readErrorField(error: unknown, field: string): unknown {
  if (!error || typeof error !== "object") return undefined;
  return (error as Record<string, unknown>)[field];
}

function safeErrorDetail(error: unknown) {
  const cause = readErrorField(error, "cause");
  return {
    name: sanitizeLogText(readErrorField(error, "name") ?? "Error", 100),
    message: sanitizeLogText(
      error instanceof Error ? error.message : readErrorField(error, "message") ?? error
    ),
    code: sanitizeLogText(readErrorField(error, "code"), 100) || undefined,
    details: sanitizeLogText(readErrorField(error, "details")) || undefined,
    hint: sanitizeLogText(readErrorField(error, "hint")) || undefined,
    status: readErrorField(error, "status") ?? readErrorField(error, "statusCode"),
    cause:
      cause && cause !== error
        ? {
            name: sanitizeLogText(readErrorField(cause, "name") ?? "Error", 100),
            message: sanitizeLogText(
              cause instanceof Error ? cause.message : readErrorField(cause, "message") ?? cause
            ),
            code: sanitizeLogText(readErrorField(cause, "code"), 100) || undefined,
          }
        : undefined,
  };
}

function dependencyUrlDetail(input: RequestInfo | URL) {
  try {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    );
    return { host: url.host, path: url.pathname };
  } catch {
    return { host: "unknown", path: "unknown" };
  }
}

function createReminderSupabaseClient(
  supabaseUrl: string,
  serviceRoleKey: string,
  context: ReminderBoundaryContext
) {
  return createClient(supabaseUrl, serviceRoleKey, {
    global: {
      fetch: async (input, init) => {
        const startedAt = Date.now();
        try {
          const response = await fetch(input, init);
          if (!response.ok) {
            const responseBody = await response
              .clone()
              .text()
              .then((body) => sanitizeLogText(body))
              .catch(() => "[unavailable]");
            const isExpectedLegacySchemaFallback =
              context.boundary === "original_same_day.query_jobs" &&
              response.status === 400 &&
              /column outage_jobs\.(status|is_closed) does not exist/i.test(responseBody);
            const log = isExpectedLegacySchemaFallback ? console.warn : console.error;
            log(
              isExpectedLegacySchemaFallback
                ? "same-day-reminder-dependency-http-fallback"
                : "same-day-reminder-dependency-http-failed",
              {
                ...context,
                ...dependencyUrlDetail(input),
                httpStatus: response.status,
                httpStatusText: response.statusText,
                durationMs: Date.now() - startedAt,
                responseBody,
              }
            );
          }
          return response;
        } catch (error) {
          console.error("same-day-reminder-dependency-fetch-failed", {
            ...context,
            ...dependencyUrlDetail(input),
            durationMs: Date.now() - startedAt,
            error: safeErrorDetail(error),
          });
          throw error;
        }
      },
    },
  });
}

async function runReminderBoundary<T>(
  context: ReminderBoundaryContext,
  operation: () => Promise<T>,
  successDetail?: (result: T) => Record<string, unknown>
): Promise<T> {
  const startedAt = Date.now();
  console.log("same-day-reminder-boundary-started", context);
  try {
    const result = await operation();
    console.log("same-day-reminder-boundary-succeeded", {
      ...context,
      durationMs: Date.now() - startedAt,
      ...(successDetail?.(result) ?? {}),
    });
    return result;
  } catch (error) {
    console.error("same-day-reminder-boundary-failed", {
      ...context,
      durationMs: Date.now() - startedAt,
      error: safeErrorDetail(error),
    });
    throw error;
  }
}

function supabaseError(error: { message: string }) {
  return new Error(error.message, { cause: error });
}

export function createEmptySameDayReminderSummary(): SameDayReminderFlowSummary {
  return {
    ok: true,
    totalRowsChecked: 0,
    matched: 0,
    sent: 0,
    skipped: 0,
    skipReasons: {},
    sampleRows: [],
    lineSendAttempts: 0,
    lineSendFailures: 0,
    updatedRows: 0,
    errors: []
  };
}

export function createEmptyNoticeDistributionSummary(): NoticeDistributionRunSummary {
  return {
    ok: true,
    totalRowsChecked: 0,
    matched: 0,
    sent: 0,
    skipped: 0,
    skipReasons: {},
    lineSendAttempts: 0,
    lineSendFailures: 0,
    logged: 0,
    errors: []
  };
}

async function fetchSameDayReminderJobs(
  supabaseUrl: string,
  serviceRoleKey: string,
  targetDate: string,
  context: ReminderBoundaryContext
): Promise<{ jobs: SameDayReminderJob[]; statusFieldExists: boolean }> {
  const supabase = createReminderSupabaseClient(supabaseUrl, serviceRoleKey, context);

  const withStatus = await supabase
    .from("outage_jobs")
    .select("id,equipment_code,outage_date,map_link,line_same_day_reminder_sent_at,status,is_closed")
    .eq("outage_date", targetDate)
    .order("outage_date", { ascending: true });

  if (!withStatus.error) {
    return {
      jobs: (withStatus.data ?? []) as SameDayReminderJob[],
      statusFieldExists: true,
    };
  }

  if (!/status|is_closed/i.test(withStatus.error.message)) {
    throw supabaseError(withStatus.error);
  }

  const withoutStatus = await supabase
    .from("outage_jobs")
    .select("id,equipment_code,outage_date,map_link,line_same_day_reminder_sent_at")
    .eq("outage_date", targetDate)
    .order("outage_date", { ascending: true });

  if (withoutStatus.error) {
    throw supabaseError(withoutStatus.error);
  }

  return {
    jobs: (withoutStatus.data ?? []) as SameDayReminderJob[],
    statusFieldExists: false,
  };
}

async function fetchNoticeDistributionJobs(
  supabaseUrl: string,
  serviceRoleKey: string,
  targetDate: string,
  context: ReminderBoundaryContext
): Promise<NoticeDistributionJob[]> {
  const supabase = createReminderSupabaseClient(supabaseUrl, serviceRoleKey, context);
  const { data, error } = await supabase
    .from("outage_jobs")
    .select(
      "id,equipment_code,outage_date,responsible_unit,customer_count,doc_purpose,doc_area_title,doc_area_detail,map_link,notice_date,notice_status,notice_completed_at,is_closed"
    )
    .eq("notice_date", targetDate)
    .eq("responsible_unit", "แผนกปฏิบัติการ")
    .order("outage_date", { ascending: true });

  if (error) throw supabaseError(error);
  return (data ?? []) as NoticeDistributionJob[];
}

async function fetchNoticeDistributionSentEventKeys(
  supabaseUrl: string,
  serviceRoleKey: string,
  targetDate: string,
  context: ReminderBoundaryContext
): Promise<Set<string>> {
  const supabase = createReminderSupabaseClient(supabaseUrl, serviceRoleKey, context);
  const { data, error } = await supabase
    .from("line_notification_events")
    .select("event_key")
    .eq("event_type", NOTICE_DISTRIBUTION_EVENT_TYPE)
    .eq("business_date", targetDate);

  if (error) throw supabaseError(error);
  return new Set((data ?? []).map((row) => String(row.event_key)));
}

async function pushLineMessage(
  token: string,
  to: string,
  text: string,
  retryKey?: string
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
  if (retryKey) headers["X-Line-Retry-Key"] = retryKey;

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers,
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
  });

  return {
    // LINE returns 409 when this retry key was already accepted. That is a
    // successful idempotent outcome and allows a previously failed DB log to
    // be repaired without sending the message again.
    ok: res.ok || (Boolean(retryKey) && res.status === 409),
    status: res.status,
    body: await res.text(),
    requestId: res.headers.get("x-line-request-id")
  };
}

function formatBangkokDateTime(now: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: BANGKOK_TIMEZONE,
    hourCycle: "h23",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(now);
}

export async function runSameDayReminder(
  input: SameDayReminderRunInput
): Promise<{ summary: SameDayReminderRunSummary; status: number }> {
  const runId = input.runId ?? randomUUID();
  const now = new Date();
  const nowUtc = now.toISOString();
  const nowBangkok = formatBangkokDateTime(now);
  const targetDateUsed = normalizeDateOnly(input.date) ?? computeBangkokTodayDateOnly(now);
  const dryRun = Boolean(input.dryRun);
  const trigger = input.trigger;
  const sameDaySummary = createEmptySameDayReminderSummary();

  const addSkipReason = (reason: string) => {
    sameDaySummary.skipped += 1;
    sameDaySummary.skipReasons[reason] =
      (sameDaySummary.skipReasons[reason] ?? 0) + 1;
  };

  const runtimeReadiness = getReminderRuntimeReadiness();
  const missing = getReminderMissingEnvKeys(runtimeReadiness);
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN as string;
  const lineTargetId = process.env.LINE_DEFAULT_TARGET_ID as string;
  const lineSupabaseUrl = process.env.SUPABASE_URL as string;
  const lineServiceRoleKey = (process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY) as string;
  const missingEnvironmentError =
    missing.length > 0
      ? `Missing required env variables: ${missing.join(", ")}`
      : null;
  const flowStartedAt = new Map<ReminderFlowName, number>();
  if (missingEnvironmentError) {
    console.error("same-day-reminder-missing-env", {
      runId,
      nowUtc,
      trigger,
      missing
    });
  }

  const flows = await runIndependentReminderFlows({
    sameDayReminder: {
      run: async () => {
        if (missingEnvironmentError) throw new Error(missingEnvironmentError);
        if (!reminderConfig.allowSameDayReminder) {
          console.warn("same-day-reminder-disabled", { runId, nowUtc, trigger });
          addSkipReason("same_day_reminder_disabled");
          return sameDaySummary;
        }

        ensureSystemCertificateAuthorities();
        const originalQueryContext: ReminderBoundaryContext = {
          runId,
          targetDate: targetDateUsed,
          trigger,
          boundary: "original_same_day.query_jobs",
          service: "supabase",
        };
        const { jobs, statusFieldExists } = await runReminderBoundary(
          originalQueryContext,
          () =>
            fetchSameDayReminderJobs(
              lineSupabaseUrl,
              lineServiceRoleKey,
              targetDateUsed,
              originalQueryContext
            ),
          (result) => ({
            rowCount: result.jobs.length,
            statusFieldExists: result.statusFieldExists,
          })
        );

        sameDaySummary.totalRowsChecked = jobs.length;
        console.log("same-day-reminder-query-result", {
          runId,
          nowUtc,
          targetDateUsed,
          totalRowsChecked: sameDaySummary.totalRowsChecked,
          statusFieldExists,
          trigger,
        });
        sameDaySummary.sampleRows = jobs.slice(0, 10).map((job) => ({
          id: job.id,
          equipment_code: job.equipment_code,
          outage_date: job.outage_date,
          status: job.status ?? null,
          line_same_day_reminder_sent_at: job.line_same_day_reminder_sent_at,
        }));

        const updateContext: ReminderBoundaryContext = {
          runId,
          targetDate: targetDateUsed,
          trigger,
          boundary: "original_same_day.update_sent_at",
          service: "supabase",
        };
        const supabase = createReminderSupabaseClient(
          lineSupabaseUrl,
          lineServiceRoleKey,
          updateContext
        );

        for (const job of jobs) {
          const skipReason = getSameDayReminderSkipReason(
            job,
            targetDateUsed,
            statusFieldExists
          );
          if (skipReason) {
            addSkipReason(skipReason);
            continue;
          }

          sameDaySummary.matched += 1;
          if (dryRun) {
            addSkipReason("dry_run_no_send");
            continue;
          }

          const lineText = formatSameDayReminderMessage({
            equipmentCode: job.equipment_code,
            outageDate: job.outage_date,
            mapLink: job.map_link,
          });
          sameDaySummary.lineSendAttempts += 1;
          const outageEventKey = `SAME_DAY_OUTAGE:${job.id}:${targetDateUsed}`;
          const originalLineContext: ReminderBoundaryContext = {
            runId,
            targetDate: targetDateUsed,
            trigger,
            boundary: "original_same_day.line_push",
            service: "line",
            jobId: job.id,
          };
          const lineResult = await runReminderBoundary(
            originalLineContext,
            () =>
              pushLineMessage(
                lineToken,
                lineTargetId,
                lineText,
                buildLineRetryKey(outageEventKey)
              ),
            (result) => ({
              ok: result.ok,
              httpStatus: result.status,
              requestId: result.requestId,
              responseBody: result.ok ? undefined : sanitizeLogText(result.body),
            })
          ).catch((error) => ({
            ok: false,
            status: 0,
            body: error instanceof Error ? error.message : "Unknown LINE push error",
            requestId: null
          }));

          if (!lineResult.ok) {
            sameDaySummary.ok = false;
            sameDaySummary.lineSendFailures += 1;
            sameDaySummary.errors.push({
              id: job.id,
              error: `LINE push failed (${lineResult.status}): ${lineResult.body}`
            });
            addSkipReason("line_push_failed");
            continue;
          }

          const { data: updatedRows, error: updateError } = await runReminderBoundary(
            { ...updateContext, jobId: job.id },
            async () =>
              await supabase
                .from("outage_jobs")
                .update({ line_same_day_reminder_sent_at: new Date().toISOString() })
                .eq("id", job.id)
                .is("line_same_day_reminder_sent_at", null)
                .select("id"),
            (result) => ({
              rowCount: result.data?.length ?? 0,
              hasError: Boolean(result.error)
            })
          );

          if (updateError) {
            sameDaySummary.ok = false;
            sameDaySummary.errors.push({
              id: job.id,
              error: `Failed to update line_same_day_reminder_sent_at: ${updateError.message}`,
            });
            addSkipReason("update_sent_at_failed");
            continue;
          }

          if (!updatedRows || updatedRows.length === 0) {
            addSkipReason("update_conflict_or_already_sent");
            continue;
          }

          sameDaySummary.updatedRows += updatedRows.length;
          sameDaySummary.sent += 1;
        }

        console.log("same-day-reminder-original-flow-completed", {
          runId,
          targetDate: targetDateUsed,
          trigger,
          matched: sameDaySummary.matched,
          sent: sameDaySummary.sent,
          skipped: sameDaySummary.skipped,
          lineSendFailures: sameDaySummary.lineSendFailures,
          updatedRows: sameDaySummary.updatedRows,
        });
        return sameDaySummary;
      },
      failedSummary: (error) => ({
        ...sameDaySummary,
        ok: false,
        errors: [
          ...sameDaySummary.errors,
          { error: error instanceof Error ? error.message : "Unknown error" }
        ]
      })
    },
    noticeDistribution: {
      run: async () => {
        if (missingEnvironmentError) throw new Error(missingEnvironmentError);
        ensureSystemCertificateAuthorities();
        const distributionQueryContext: ReminderBoundaryContext = {
          runId,
          targetDate: targetDateUsed,
          trigger,
          boundary: "notice_distribution.query_jobs",
          service: "supabase",
        };
        const distributionJobs = await runReminderBoundary(
          distributionQueryContext,
          () =>
            fetchNoticeDistributionJobs(
              lineSupabaseUrl,
              lineServiceRoleKey,
              targetDateUsed,
              distributionQueryContext
            ),
          (jobs) => ({ rowCount: jobs.length })
        );
        const eventQueryContext: ReminderBoundaryContext = {
          runId,
          targetDate: targetDateUsed,
          trigger,
          boundary: "notice_distribution.query_event_log",
          service: "supabase",
        };
        const sentDistributionEventKeys = await runReminderBoundary(
          eventQueryContext,
          () =>
            fetchNoticeDistributionSentEventKeys(
              lineSupabaseUrl,
              lineServiceRoleKey,
              targetDateUsed,
              eventQueryContext
            ),
          (eventKeys) => ({ rowCount: eventKeys.size })
        );
        const eventInsertContext: ReminderBoundaryContext = {
          runId,
          targetDate: targetDateUsed,
          trigger,
          boundary: "notice_distribution.notification_log_insert",
          service: "supabase",
        };
        const distributionSupabase = createReminderSupabaseClient(
          lineSupabaseUrl,
          lineServiceRoleKey,
          eventInsertContext
        );
        const distributionProcessContext: ReminderBoundaryContext = {
          runId,
          targetDate: targetDateUsed,
          trigger,
          boundary: "notice_distribution.process",
          service: "application",
        };

        return runReminderBoundary(
          distributionProcessContext,
          () =>
            processNoticeDistributionJobs({
              jobs: distributionJobs,
              targetDate: targetDateUsed,
              dryRun,
              sentEventKeys: sentDistributionEventKeys,
              pushMessage: async ({ job, message, retryKey }) => {
                const lineContext: ReminderBoundaryContext = {
                  runId,
                  targetDate: targetDateUsed,
                  trigger,
                  boundary: "notice_distribution.line_push",
                  service: "line",
                  jobId: job.id,
                };
                return runReminderBoundary(
                  lineContext,
                  () => pushLineMessage(lineToken, lineTargetId, message, retryKey),
                  (result) => ({
                    ok: result.ok,
                    httpStatus: result.status,
                    requestId: result.requestId,
                    responseBody: result.ok ? undefined : sanitizeLogText(result.body),
                  })
                );
              },
              recordSentEvent: async ({ job, eventKey, targetDate, requestId }) => {
                const insertContext = { ...eventInsertContext, jobId: job.id };
                await runReminderBoundary(insertContext, async () => {
                  const { error } = await distributionSupabase
                    .from("line_notification_events")
                    .insert({
                      event_key: eventKey,
                      event_type: NOTICE_DISTRIBUTION_EVENT_TYPE,
                      job_id: job.id,
                      business_date: targetDate,
                      sent_at: new Date().toISOString(),
                      line_request_id: requestId
                    });

                  // A concurrent invocation may have logged the same successful LINE
                  // retry key first. The primary key makes that a safe success.
                  if (error && error.code !== "23505") throw supabaseError(error);
                });
              }
            }),
          (result) => ({
            ok: result.ok,
            matched: result.matched,
            sent: result.sent,
            logged: result.logged,
            lineSendFailures: result.lineSendFailures,
          })
        );
      },
      failedSummary: (error) => ({
        ...createEmptyNoticeDistributionSummary(),
        ok: false,
        errors: [
          { error: error instanceof Error ? error.message : "Unknown error" }
        ]
      })
    },
    lifecycle: {
      started: (flow) => {
        flowStartedAt.set(flow, Date.now());
        console.log("daily-line-reminder-flow-started", {
          runId,
          flow,
          targetDate: targetDateUsed,
          trigger
        });
      },
      completed: (flow, flowSummary) => {
        const log = flowSummary.ok ? console.log : console.error;
        log("daily-line-reminder-flow-completed", {
          runId,
          flow,
          targetDate: targetDateUsed,
          trigger,
          ok: flowSummary.ok,
          errors: flowSummary.ok ? [] : flowSummary.errors,
          durationMs: Date.now() - (flowStartedAt.get(flow) ?? Date.now())
        });
      },
      failed: (flow, error) => {
        console.error("daily-line-reminder-flow-failed", {
          runId,
          flow,
          targetDate: targetDateUsed,
          trigger,
          durationMs: Date.now() - (flowStartedAt.get(flow) ?? Date.now()),
          error: safeErrorDetail(error)
        });
      }
    }
  });

  const ok = flows.sameDayReminder.ok && flows.noticeDistribution.ok;
  const summary: SameDayReminderRunSummary = {
    ok,
    runId,
    nowUtc,
    nowBangkok,
    targetDateUsed,
    dryRun,
    trigger,
    ...flows
  };

  console.log("same-day-reminder-run", summary);
  return {
    status: ok ? 200 : missingEnvironmentError ? 500 : 502,
    summary
  };
}
