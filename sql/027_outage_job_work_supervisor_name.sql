ALTER TABLE public.outage_jobs
ADD COLUMN IF NOT EXISTS work_supervisor_name text NULL;

COMMENT ON COLUMN public.outage_jobs.work_supervisor_name IS
  'Name of the person supervising the outage work. Nullable for legacy jobs and current optional workflows.';
