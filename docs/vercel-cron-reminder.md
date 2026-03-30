# Vercel Cron + Reminder (Same-day Only)

## สรุป
ระบบ Planned Outage Reminder ปัจจุบันเหลือเฉพาะ **Same-day reminder**
(ไม่ใช้ lead reminder แล้ว)

- Same-day reminder route: `/api/jobs/reminder/same-day/run`
- Config กลาง: `src/lib/reminderConfig.ts`

## ค่าคงที่ที่ใช้งานจริง

- `timezone = Asia/Bangkok`
- `allowSameDayReminder = true`
- `sameDayRunDisplayTime = 08:00`

## Cron schedule (UTC)

Vercel cron ใช้ UTC:

- `/api/jobs/reminder/same-day/run` → `0 1 * * *` (08:00 เวลาไทย)

## Business logic ที่ใช้งานจริง

### Same-day reminder
- targetDate = วันนี้ตามเวลา Bangkok
- query เฉพาะงาน `outage_date = targetDate`
- query เฉพาะงานที่ `line_same_day_reminder_sent_at IS NULL` (ยกเว้น forceSend)
- skip งาน closed/done และงานที่ `is_closed = true`
- ส่ง LINE
- update `line_same_day_reminder_sent_at`

## หมายเหตุ

- ไม่มีหน้า `/settings/reminders` และไม่มี flow แก้ไข settings ผ่าน UI
- ใน DB อาจยังมีตาราง/คอลัมน์จาก lead reminder เดิม แต่ code path ปัจจุบันไม่ใช้งานแล้ว
