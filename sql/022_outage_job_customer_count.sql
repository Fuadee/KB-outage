ALTER TABLE public.outage_jobs
ADD COLUMN IF NOT EXISTS customer_count integer NULL;

ALTER TABLE public.outage_jobs
DROP CONSTRAINT IF EXISTS outage_jobs_customer_count_check;

ALTER TABLE public.outage_jobs
ADD CONSTRAINT outage_jobs_customer_count_check
CHECK (customer_count IS NULL OR customer_count >= 0);

COMMENT ON COLUMN public.outage_jobs.customer_count IS
  'Number of electricity users affected by the outage. Nullable for legacy jobs.';
