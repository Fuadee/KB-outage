# Vercel Cron + Reminder (Hardcoded Config)

## สรุป
ระบบ Reminder ใช้ cron จาก Vercel และใช้ค่าคงที่จาก code โดยตรง (ไม่อ่าน settings จาก DB)

- Lead reminder route: `/api/jobs/reminder/run`
- Same-day reminder route: `/api/jobs/reminder/same-day/run`
- Config กลาง: `src/lib/reminderConfig.ts`

## ค่าคงที่ที่ใช้งานจริง

- `timezone = Asia/Bangkok`
- `leadReminderEnabled = true`
- `leadReminderDays = 5`
- `sameDayReminderEnabled = true`
- `cronRunTimeDisplay = 08:00`

## Cron schedule (UTC)

Vercel cron ใช้ UTC:

- `/api/jobs/reminder/run` → `0 1 * * *` (08:00 เวลาไทย)
- `/api/jobs/reminder/same-day/run` → `0 1 * * *` (08:00 เวลาไทย)

## Business logic ที่คงไว้

### 1) Lead reminder
- targetDate = วันนี้ตามเวลา Bangkok + 5 วัน
- query เฉพาะงาน `outage_date = targetDate`
- query เฉพาะงานที่ `line_reminder_sent_at IS NULL`
- skip งาน closed/done
- ส่ง LINE
- update `line_reminder_sent_at`

### 2) Same-day reminder
- targetDate = วันนี้ตามเวลา Bangkok
- query เฉพาะงาน `outage_date = targetDate`
- query เฉพาะงานที่ `line_same_day_reminder_sent_at IS NULL` (ยกเว้น forceSend)
- skip งาน closed/done
- ส่ง LINE
- update `line_same_day_reminder_sent_at`

## หมายเหตุ

- ไม่มี reminder settings API/preview API แล้ว
- หน้า `/settings/reminders` เป็น read-only เพื่ออธิบาย behavior ที่ตรงกับ cron จริง
