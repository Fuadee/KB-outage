export const reminderConfig = {
  timezone: "Asia/Bangkok",
  leadReminderEnabled: true,
  leadReminderDays: 5,
  sameDayReminderEnabled: true,
  cronRunTimeDisplay: "08:00",
} as const;

export type ReminderConfig = typeof reminderConfig;
