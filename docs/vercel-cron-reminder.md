# Vercel Cron for LINE Outage Reminder

## What this cron does
This project uses Vercel Cron to trigger the outage reminder endpoint automatically every day.

- Cron path: `/api/jobs/reminder/run`
- The API route runs reminder logic against `outage_jobs`
- It computes target date as **today + 5 days** using **Asia/Bangkok**
- It sends LINE reminders only when `line_reminder_sent_at` is `null`

## Why the schedule is `0 1 * * *`
Vercel Cron schedules are interpreted in **UTC**.

- `0 1 * * *` = 01:00 UTC every day
- Thailand (Asia/Bangkok) is UTC+7
- 01:00 UTC = 08:00 Thailand time

## Manual test endpoints
After deployment, you can test the endpoint directly:

- `GET /api/jobs/reminder/run`
- `POST /api/jobs/reminder/run`

Manual date override for verification:

- `GET /api/jobs/reminder/run?date=2026-03-14`
- `POST /api/jobs/reminder/run` with body `{ "date": "2026-03-14" }`

## Debug output
The endpoint returns diagnostic fields to help troubleshooting:

- `diagnostics.serverTimeUtc`
- `diagnostics.bangkokDateTime`
- `diagnostics.timezone`
- `diagnostics.requestedDateOverride`
- `diagnostics.skipReasons`
- `errors[]` with per-job failure details

## Important notes
- Vercel Cron runs only after the project is deployed to Vercel.
- Check your Vercel plan limits (Hobby plan may have cron/function usage limits).
