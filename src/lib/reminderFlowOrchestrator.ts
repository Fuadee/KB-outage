export type ReminderFlowName = "sameDayReminder" | "noticeDistribution";

export type ReminderFlowSummary = {
  ok: boolean;
  errors: Array<{ id?: number | string; error: string }>;
};

type ReminderFlowDefinition<T extends ReminderFlowSummary> = {
  run: () => Promise<T>;
  failedSummary: (error: unknown) => T;
};

export type ReminderFlowLifecycle = {
  started?: (flow: ReminderFlowName) => void;
  completed?: (flow: ReminderFlowName, summary: ReminderFlowSummary) => void;
  failed?: (flow: ReminderFlowName, error: unknown) => void;
};

export async function runIndependentReminderFlows<
  TSameDay extends ReminderFlowSummary,
  TNoticeDistribution extends ReminderFlowSummary
>(input: {
  sameDayReminder: ReminderFlowDefinition<TSameDay>;
  noticeDistribution: ReminderFlowDefinition<TNoticeDistribution>;
  lifecycle?: ReminderFlowLifecycle;
}): Promise<{
  sameDayReminder: TSameDay;
  noticeDistribution: TNoticeDistribution;
}> {
  async function execute<T extends ReminderFlowSummary>(
    flow: ReminderFlowName,
    definition: ReminderFlowDefinition<T>
  ): Promise<T> {
    input.lifecycle?.started?.(flow);
    try {
      const summary = await definition.run();
      input.lifecycle?.completed?.(flow, summary);
      return summary;
    } catch (error) {
      input.lifecycle?.failed?.(flow, error);
      return definition.failedSummary(error);
    }
  }

  // Keep the established order, but isolate each awaited flow so a rejection
  // from either one can never prevent the other flow from being attempted.
  const sameDayReminder = await execute(
    "sameDayReminder",
    input.sameDayReminder
  );
  const noticeDistribution = await execute(
    "noticeDistribution",
    input.noticeDistribution
  );

  return { sameDayReminder, noticeDistribution };
}
