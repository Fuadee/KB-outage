# Vercel Cron + Reminder Settings (LINE) — Hobby Plan

## สรุประบบใหม่
ระบบ Reminder ถูกปรับให้รองรับ **Vercel Hobby** โดยใช้ cron trigger แบบ **วันละครั้งต่อ route** เท่านั้น และไม่พึ่งพา logic เวลาแบบนาทีเป๊ะจาก DB อีกต่อไป

- Lead reminder route: `/api/jobs/reminder/run`
- Same-day reminder route: `/api/jobs/reminder/same-day/run`

## Cron schedule (UTC)
Vercel cron ใช้ UTC:

- `/api/jobs/reminder/run` → `0 1 * * *` (ประมาณ 08:00 ไทย)
- `/api/jobs/reminder/same-day/run` → `30 7 * * *` (ประมาณ 14:30 ไทย)

> ข้อจำกัด Vercel Hobby: งาน cron อาจคลาดเคลื่อนระดับชั่วโมงได้ จึงเน้น “ถูกวัน” มากกว่า “ตรงนาที”

## Business logic ที่คงไว้

### 1) Lead reminder
- targetDate = วันนี้ตามเวลา Bangkok + lead_reminder_days
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

## Reminder settings ที่ยังใช้
ยังคงใช้ settings จากตาราง `reminder_settings` เฉพาะ:
- `lead_reminder_enabled`
- `lead_reminder_days`
- `same_day_reminder_enabled`
- `timezone` (ต้องเป็น `Asia/Bangkok`)

**หมายเหตุ:** field เวลา `lead_reminder_time` / `same_day_reminder_time` ยังคงเก็บใน DB ได้เพื่อ backward compatibility แต่ route ไม่ใช้ตัดสินใจส่งแล้ว

## Observability logs
แต่ละ route จะมี log หลัก:
- `reminder-route-start`
- `reminder-target-date`
- `reminder-total-rows`
- `reminder-sent-count`
- `reminder-skipped-count`
- `reminder-route-end`

## Manual testing

1) Lead reminder (manual GET)
- `GET /api/jobs/reminder/run?date=YYYY-MM-DD`

2) Same-day reminder (manual GET)
- `GET /api/jobs/reminder/same-day/run?date=YYYY-MM-DD`

3) Dry run (ไม่ส่งจริง)
- `GET /api/jobs/reminder/same-day/run?date=YYYY-MM-DD&dryRun=1`

4) Force send (manual POST)
- `POST /api/jobs/reminder/same-day/run` body: `{ "date": "YYYY-MM-DD", "forceSend": 1 }`

## ข้อจำกัดสำคัญบน Hobby
- ไม่รองรับ realtime reminder แบบนาทีเป๊ะ
- ไม่รองรับ polling ทุก 5 นาที
- ไม่ควรผูก UX ว่าตั้งเวลาเองได้แบบทันทีแล้ว backend จะยิงตรงนาที

## Reminder Preview (Settings Page)

- Endpoint preview: `GET /api/settings/reminders/preview`
- Optional query: `previewDate=YYYY-MM-DD` (สำหรับ debug/จำลองวันที่)
- Response จะคืน `leadPreview` และ `sameDayPreview` พร้อมรายการ `items` ที่มี:
  - `wouldSend`: ถ้าระบบรันตอนนี้งานนี้จะถูกส่งหรือไม่
  - `skipReason`: เหตุผลที่ข้าม (เช่น `already_sent`, `already_sent_same_day`, `status=closed`, `is_closed=true`, `reminder_disabled`)
  - `messagePreview`: ข้อความที่ระบบจะส่ง (format เดียวกับ helper จริง)
- Preview query ข้อมูลจริงจาก DB แต่เป็น **preview-only**:
  - ไม่เรียก LINE API
  - ไม่อัปเดต `line_reminder_sent_at`
  - ไม่อัปเดต `line_same_day_reminder_sent_at`
- หน้า `/settings/reminders` จะ refresh preview อัตโนมัติหลังบันทึก settings สำเร็จ
