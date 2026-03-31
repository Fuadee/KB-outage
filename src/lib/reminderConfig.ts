export const reminderConfig = {
  timezone: "Asia/Bangkok",
  allowSameDayReminder: true,
  sameDayRunDisplayTime: "09:30",
} as const;

export type ReminderConfig = typeof reminderConfig;
