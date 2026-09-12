ALTER TABLE public.outage_jobs
ADD COLUMN IF NOT EXISTS has_switching boolean NULL;

COMMENT ON COLUMN public.outage_jobs.has_switching IS
  'Whether the outage job requires a Switching Order. Nullable only for legacy jobs created before this field was introduced.';
