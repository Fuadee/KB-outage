# Reminder Trigger Strategy (External Scheduler First)

## สรุปแนวทางใหม่
ระบบ Planned Outage Reminder ปัจจุบันเหลือเฉพาะ **Same-day reminder** เหมือนเดิม แต่เปลี่ยน trigger หลักเป็น **external scheduler** แทน Vercel Cron

- Same-day reminder route: `/api/jobs/reminder/same-day/run`
- รองรับทั้ง `GET` และ `POST`
- trigger หลัก: external scheduler (เช่น cron-job.org / GitHub Actions)
- Vercel Cron: เก็บไว้เป็น optional/fallback เท่านั้น

## ค่าคงที่ที่ใช้งานจริง

- `timezone = Asia/Bangkok`
- `allowSameDayReminder = true`
- `sameDayRunDisplayTime = 09:30`

## เวลา schedule

- เวลาไทยที่ต้องการ: `09:30 Asia/Bangkok`
- UTC ที่ตรงกัน: `02:30 UTC`

### ถ้าใช้ Vercel Cron (fallback)
- `/api/jobs/reminder/same-day/run` → `30 2 * * *` (02:30 UTC = 09:30 เวลาไทย)

## Endpoint contract

### `GET /api/jobs/reminder/same-day/run`
### `POST /api/jobs/reminder/same-day/run`

Headers:
- `x-reminder-secret: <REMINDER_JOB_SECRET>` (required)

Query/body params:
- `date=YYYY-MM-DD` (optional; ถ้าไม่ส่งจะใช้ "วันนี้" ตาม Asia/Bangkok)
- `dryRun=1` (optional; ถ้าส่งจะไม่ยิง LINE และไม่ mark sent)

## Data flow (same-day)

1. validate `x-reminder-secret`
2. resolve target date (query/body > Bangkok today)
3. query `outage_jobs` ตาม `outage_date = targetDate`
4. กรอง skip ด้วยเงื่อนไข:
   - `line_same_day_reminder_sent_at` มีค่าแล้ว
   - `is_closed = true`
   - `status in (closed, done)`
5. ถ้าไม่ใช่ dry-run:
   - ส่ง LINE push
   - update `line_same_day_reminder_sent_at` แบบ idempotent (`... IS NULL`)

## หมายเหตุ

- response จะมี debug fields ครบ: `nowUtc`, `nowBangkok`, `targetDateUsed`, `dryRun`, counters, `skipReasons`, `sampleRows`
- 5-day reminder ไม่ถูกแตะ เพราะ code path ปัจจุบันใช้ same-day เท่านั้น
