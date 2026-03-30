export const reminderConfig = {
  timezone: "Asia/Bangkok",
  allowSameDayReminder: true,
  sameDayRunDisplayTime: "08:00",
} as const;

export type ReminderConfig = typeof reminderConfig;
