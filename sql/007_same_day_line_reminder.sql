ALTER TABLE public.outage_jobs
ADD COLUMN IF NOT EXISTS line_same_day_reminder_sent_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS outage_jobs_same_day_reminder_idx
ON public.outage_jobs (outage_date)
WHERE line_same_day_reminder_sent_at IS NULL;
