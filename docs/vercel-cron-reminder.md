# Vercel Cron for LINE Outage Reminders

## What these crons do
This project uses Vercel Cron to trigger LINE reminder endpoints automatically every day.

### 1) 5-day reminder (existing)
- Cron path: `/api/jobs/reminder/run`
- Target date logic: **today + 5 days** (Asia/Bangkok)
- Send condition: `line_reminder_sent_at IS NULL`
- Send flag update: `line_reminder_sent_at`

### 2) Same-day reminder (new)
- Cron path: `/api/jobs/reminder/same-day/run`
- Target date logic: **today** (Asia/Bangkok)
- Send condition: `line_same_day_reminder_sent_at IS NULL`
- Send flag update: `line_same_day_reminder_sent_at`

## Cron schedule conversion (UTC)
Vercel Cron schedules are interpreted in **UTC**.

### 5-day reminder at 08:00 Thailand time
- Schedule: `0 1 * * *`
- 01:00 UTC = 08:00 Asia/Bangkok (UTC+7)

### Same-day reminder at 14:45 Thailand time
- Schedule: `45 7 * * *`
- 07:45 UTC = 14:45 Asia/Bangkok (UTC+7)

## Manual test endpoints
After deployment, you can test each endpoint directly:

### 5-day reminder
- `GET /api/jobs/reminder/run`
- `POST /api/jobs/reminder/run`

Manual date override for verification:
- `GET /api/jobs/reminder/run?date=2026-03-14`
- `POST /api/jobs/reminder/run` with body `{ "date": "2026-03-14" }`

### Same-day reminder
- `GET /api/jobs/reminder/same-day/run`
- `POST /api/jobs/reminder/same-day/run`

Manual date override for verification:
- `GET /api/jobs/reminder/same-day/run?date=2026-03-14`
- `POST /api/jobs/reminder/same-day/run` with body `{ "date": "2026-03-14" }`

Manual debug mode (same-day only):
- Dry-run (query + skip evaluation only, no LINE send, no sent-flag update):
  - `GET /api/jobs/reminder/same-day/run?date=2026-03-14&dryRun=1`
- Force-send (manual POST only, explicit opt-in, allows bypassing sent flag):
  - `POST /api/jobs/reminder/same-day/run?date=2026-03-14&forceSend=1`
  - Body example: `{ "date": "2026-03-14", "forceSend": true }`

## Debug output
Both endpoints return diagnostic fields to help troubleshooting:

- `targetDateUsed`
- `totalRowsChecked`
- `matched`
- `sent`
- `skipped`
- `sampleRows`
- `diagnostics.serverTimeUtc`
- `diagnostics.bangkokDateTime`
- `diagnostics.timezone`
- `diagnostics.requestedDateOverride`
- `diagnostics.skipReasons`
- `errors[]` with per-job failure details

Same-day endpoint also returns:
- `mode` (`normal` / `dryRun` / `forceSend`)
- `eligible`
- `skipReasons`
- `lineSendAttempts`
- `lineSendFailures`
- `updatedRows`

## Log keys for same-day debug
Search these keys in function logs:
- `same-day-reminder-route-start`
- `same-day-reminder-target-date`
- `same-day-reminder-query-start`
- `same-day-reminder-query-end`
- `same-day-reminder-total-rows`
- `same-day-reminder-row-skip`
- `same-day-reminder-row-eligible`
- `same-day-reminder-line-send-start`
- `same-day-reminder-line-send-success`
- `same-day-reminder-line-send-failed`
- `same-day-reminder-update-sent-start`
- `same-day-reminder-update-sent-success`
- `same-day-reminder-update-sent-conflict`
- `same-day-reminder-route-end`

## Important notes
- Vercel Cron runs only after the project is deployed to Vercel.
- Keep 5-day and same-day sent flags separate to avoid cross-flow interference.
- Check your Vercel plan limits (Hobby plan may have cron/function usage limits).
