# Same-day LINE Reminder Runbook (External Scheduler First)

## 1) Architecture (production)

- Canonical execution endpoint: `https://<your-production-domain>/api/jobs/reminder/same-day/run`
- This endpoint is the **primary production entrypoint** for scheduler calls.
- Business logic stays in `runSameDayReminder` service.
- Vercel Cron is removed from same-day production path to avoid duplicate triggers.
- 5-day reminder flow is intentionally not changed in this migration.

## 2) Endpoint contract

### URL
`/api/jobs/reminder/same-day/run`

### Methods
- `GET`
- `POST` (JSON body)

### Required header
- `x-reminder-secret: <REMINDER_JOB_SECRET>`

### Security behavior
- Missing `x-reminder-secret` -> `401`
- Invalid `x-reminder-secret` -> `403`
- Missing critical env vars (`REMINDER_JOB_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_DEFAULT_TARGET_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) -> `500`

### Query/body parameters
- `date=YYYY-MM-DD` (optional)
- `dryRun=1` (optional)

If `date` is omitted, system uses current Bangkok date (`Asia/Bangkok`).

## 3) Request examples

### cURL dry-run (recommended first)
```bash
curl -X GET "https://<your-production-domain>/api/jobs/reminder/same-day/run?date=2026-03-31&dryRun=1" \
  -H "x-reminder-secret: <REMINDER_JOB_SECRET>"
```

### cURL real run
```bash
curl -X GET "https://<your-production-domain>/api/jobs/reminder/same-day/run?date=2026-03-31" \
  -H "x-reminder-secret: <REMINDER_JOB_SECRET>"
```

### cURL POST JSON dry-run
```bash
curl -X POST "https://<your-production-domain>/api/jobs/reminder/same-day/run" \
  -H "Content-Type: application/json" \
  -H "x-reminder-secret: <REMINDER_JOB_SECRET>" \
  -d '{"date":"2026-03-31","dryRun":true}'
```

### cURL POST JSON real run
```bash
curl -X POST "https://<your-production-domain>/api/jobs/reminder/same-day/run" \
  -H "Content-Type: application/json" \
  -H "x-reminder-secret: <REMINDER_JOB_SECRET>" \
  -d '{"date":"2026-03-31"}'
```

## 4) PowerShell examples (Windows ops)

```powershell
$baseUrl = "https://<your-production-domain>"
$secret = "<REMINDER_JOB_SECRET>"
$headers = @{ "x-reminder-secret" = $secret }
```

### PowerShell dry-run (GET)
```powershell
Invoke-RestMethod -Method GET `
  -Uri "$baseUrl/api/jobs/reminder/same-day/run?date=2026-03-31&dryRun=1" `
  -Headers $headers
```

### PowerShell real run (GET)
```powershell
Invoke-RestMethod -Method GET `
  -Uri "$baseUrl/api/jobs/reminder/same-day/run?date=2026-03-31" `
  -Headers $headers
```

### PowerShell dry-run (POST JSON)
```powershell
$body = @{ date = "2026-03-31"; dryRun = $true } | ConvertTo-Json
Invoke-RestMethod -Method POST `
  -Uri "$baseUrl/api/jobs/reminder/same-day/run" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

## 5) Scheduler timing requirements

- Scheduler timezone must be: `Asia/Bangkok`
- Recommended run time: `08:00 Asia/Bangkok`
- Do not set duplicate schedulers for the same endpoint/time.

## 6) Expected response fields for monitoring

Response includes ops-friendly fields:
- `ok`
- `nowUtc`
- `nowBangkok`
- `targetDateUsed`
- `dryRun`
- `totalRowsChecked`
- `matched`
- `sent`
- `skipped`
- `skipReasons`
- `sampleRows`
- `lineSendAttempts`
- `lineSendFailures`
- `updatedRows`
- `trigger`
- `errors`

## 7) Verify after run

1. Check API response:
   - `ok=true`
   - `targetDateUsed` matches expected date
   - counters (`matched`, `sent`, `skipped`, `skipReasons`) are reasonable
2. Check Vercel logs for:
   - request timestamp
   - auth pass/fail
   - target date used
   - rows queried
   - skip reasons
   - LINE send attempts/failures
   - sent flag update result (`updatedRows`)
3. Check DB:
   - `line_same_day_reminder_sent_at` written for successfully sent records
4. Re-run same date:
   - should skip with `already_sent_same_day`

## 8) Deployment / ops checklist

- [ ] Confirm `REMINDER_JOB_SECRET` in production environment
- [ ] Confirm `LINE_CHANNEL_ACCESS_TOKEN`
- [ ] Confirm `LINE_DEFAULT_TARGET_ID`
- [ ] Confirm `SUPABASE_URL`
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Run one manual dry-run
- [ ] Validate response counters + `skipReasons` + `sampleRows`
- [ ] Configure external scheduler only after dry-run passes
- [ ] Run one manual real run (end-to-end)
- [ ] Confirm `line_same_day_reminder_sent_at` is updated
- [ ] Re-run same date and confirm `already_sent_same_day`

## 9) External scheduler examples

### A) cron-job.org

- Timezone: set to `Asia/Bangkok`
- Schedule: daily at `08:00`
- URL: `https://<your-production-domain>/api/jobs/reminder/same-day/run`
- Method: `GET` (or `POST`)
- Headers:
  - `x-reminder-secret: <REMINDER_JOB_SECRET>`
- Query for initial validation:
  - `?dryRun=1`
- After validation, remove `dryRun=1` for real execution.

### B) GitHub Actions (scheduled workflow)

> GitHub Actions cron runs in UTC. For 08:00 Asia/Bangkok, use 01:00 UTC.

Example workflow:

```yaml
name: Same-day LINE Reminder

on:
  schedule:
    - cron: "0 1 * * *" # 01:00 UTC = 08:00 Asia/Bangkok
  workflow_dispatch:

jobs:
  trigger-reminder:
    runs-on: ubuntu-latest
    steps:
      - name: Dry run (initial stage only)
        run: |
          curl -fsS "https://<your-production-domain>/api/jobs/reminder/same-day/run?dryRun=1" \
            -H "x-reminder-secret: ${{ secrets.REMINDER_JOB_SECRET }}"

      # For production real run, replace with:
      # - name: Real run
      #   run: |
      #     curl -fsS "https://<your-production-domain>/api/jobs/reminder/same-day/run" \
      #       -H "x-reminder-secret: ${{ secrets.REMINDER_JOB_SECRET }}"
```

Recommended secret storage:
- Put `REMINDER_JOB_SECRET` in scheduler secret manager (cron-job.org advanced headers / GitHub Actions Secrets).
- Never hardcode secret in repository, workflow history, or public logs.

## 10) Rollback plan

If external scheduler must be rolled back temporarily:

1. Pause external scheduler job first.
2. Run manual `dryRun=1` to confirm endpoint health.
3. If temporary fallback is required, add exactly one backup trigger path (avoid dual active schedulers).
4. After issue resolution, return to single external scheduler and remove fallback.

## 11) Duplicate-trigger prevention rules

- Keep only one active production scheduler for same-day reminder.
- Do not run Vercel Cron and external scheduler simultaneously for same-day route.
- Use idempotency guard (`line_same_day_reminder_sent_at IS NULL`) as defense-in-depth, not as license for duplicate schedules.
