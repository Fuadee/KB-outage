ALTER TABLE public.outage_jobs
ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS closed_by uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'outage_jobs_closed_by_fkey'
  ) THEN
    ALTER TABLE public.outage_jobs
    ADD CONSTRAINT outage_jobs_closed_by_fkey
    FOREIGN KEY (closed_by)
    REFERENCES auth.users (id);
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated can update closed jobs" ON public.outage_jobs;
CREATE POLICY "Authenticated can update closed jobs"
  ON public.outage_jobs
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
