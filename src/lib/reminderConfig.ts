export const reminderConfig = {
  timezone: "Asia/Bangkok",
  leadDays: 5,
  allowSameDayReminder: true,
  reminderRunDisplayTime: "08:00",
  sameDayRunDisplayTime: "08:00",
} as const;

export type ReminderConfig = typeof reminderConfig;
