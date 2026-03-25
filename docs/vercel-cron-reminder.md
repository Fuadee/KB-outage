# Vercel Cron + Reminder Settings (LINE)

## Reminder Settings คืออะไร
ระบบนี้ทำให้ผู้ใช้ตั้งค่าเวลาแจ้งเตือนจากหน้าเว็บได้ โดยไม่ต้องแก้เวลา cron ใน `vercel.json` ทุกครั้ง

- Lead reminder (แจ้งเตือนล่วงหน้า)
  - เปิด/ปิดได้
  - กำหนดจำนวนวันล่วงหน้าได้
  - กำหนดเวลาได้ (HH:mm)
- Same-day reminder (แจ้งเตือนวันจริง)
  - เปิด/ปิดได้
  - กำหนดเวลาได้ (HH:mm)

> ทุกเวลาอิง `Asia/Bangkok`

## สถาปัตยกรรมใหม่
Vercel Cron เปลี่ยนเป็นวิ่งถี่คงที่ทุก 5 นาที แล้ว route จะเป็นคนเช็ค schedule จาก DB เอง

1. cron เรียก endpoint ทุก 5 นาที
2. endpoint โหลด `reminder_settings` จาก DB
3. endpoint ตรวจเวลาไทยว่าตรงกับ `HH:mm` ที่ตั้งไว้หรือไม่ (window 5 นาที)
4. ถ้ายังไม่ถึงเวลา จะ `skip` และตอบเหตุผล (`skipped because not scheduled time`)
5. ถ้าตรงเวลา ค่อยทำ flow เดิม (query งาน + ส่ง LINE + update sent flag)

แนวทางนี้ทำให้เปลี่ยนเวลาได้จาก UI ทันที โดยไม่แตะ cron runtime

## Cron schedule ใหม่ (UTC)
Vercel cron ใช้ UTC และตอนนี้ตั้งคงที่ไว้แบบถี่:

- `/api/jobs/reminder/run` → `*/5 * * * *`
- `/api/jobs/reminder/same-day/run` → `*/5 * * * *`

## Settings API
- `GET /api/settings/reminders`
  - อ่านค่าปัจจุบัน (get-or-create default row)
- `PUT /api/settings/reminders`
  - บันทึกค่าใหม่พร้อม validation

Validation หลัก:
- `timezone` ต้องเป็น `Asia/Bangkok`
- `lead_reminder_days` ต้องเป็นจำนวนเต็มช่วง `0..30`
- เวลา (`lead_reminder_time`, `same_day_reminder_time`) ต้องรูปแบบ `HH:mm`

## หน้าเว็บสำหรับผู้ใช้
หน้า: `/settings/reminders`

มี 2 ส่วน:
- แจ้งเตือนล่วงหน้า: toggle + จำนวนวัน + เวลา
- แจ้งเตือนวันจริง: toggle + เวลา

พร้อมปุ่มบันทึก, loading state, success/error feedback

## Debug เมื่อ cron วิ่งแต่ไม่ส่ง LINE
ให้ดู response และ logs ต่อไปนี้:

### Response field ที่สำคัญ
- `skippedBySchedule`
- `reason`
- `diagnostics.scheduleGate.enabled`
- `diagnostics.scheduleGate.configuredTime`
- `diagnostics.scheduleGate.nowWithinWindow`
- `targetDateUsed`, `skipReasons`, `errors`

### Log keys
- `reminder-settings-load-start`
- `reminder-settings-load-end`
- `reminder-schedule-check`
- `reminder-schedule-skip-not-time-yet`
- `reminder-schedule-match`

## หมายเหตุสำคัญ
- การกันส่งซ้ำยังใช้ sent flag ต่อรายการงานเหมือนเดิม:
  - lead: `line_reminder_sent_at`
  - same-day: `line_same_day_reminder_sent_at`
- settings เป็นแค่ schedule gate ว่ารอบนี้ควร “เริ่มส่งหรือยัง”
- สามารถทดสอบ manual override date ได้เหมือนเดิมผ่าน query/body `date`
