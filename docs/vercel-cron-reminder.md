# Vercel Cron Status for Reminder Jobs

## Current policy (production)

- **Same-day LINE reminder no longer uses Vercel Cron in production.**
- Canonical endpoint remains: `/api/jobs/reminder/same-day/run`
- Production trigger strategy is now **external scheduler first**.

## Why

Previous production behavior confirmed reminder logic works, but trigger timing from Vercel Cron did not meet strict 08:00 Asia/Bangkok requirement.

## Scope

- Same-day reminder: moved to external scheduler.
- 5-day reminder: unchanged behavior/path (not modified in this migration).

## Important

Do not configure both Vercel Cron and external scheduler for same-day reminder at the same time, or duplicate trigger risk will increase.

For production runbook and scheduler setup details, use:
- `docs/external-scheduler-same-day-reminder.md`
