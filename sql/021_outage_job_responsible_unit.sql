ALTER TABLE public.outage_jobs
ADD COLUMN IF NOT EXISTS responsible_unit text NULL;

ALTER TABLE public.outage_jobs
DROP CONSTRAINT IF EXISTS outage_jobs_responsible_unit_check;

ALTER TABLE public.outage_jobs
ADD CONSTRAINT outage_jobs_responsible_unit_check
CHECK (
  responsible_unit IS NULL
  OR responsible_unit IN (
    'แผนกปฏิบัติการ',
    'แผนกก่อสร้าง',
    'กฟส.อ่าวนาง'
  )
);

COMMENT ON COLUMN public.outage_jobs.responsible_unit IS
  'Responsible unit for the outage job. Nullable for jobs created before this field was introduced.';

