ALTER TABLE outage_jobs
ADD COLUMN IF NOT EXISTS notice_status text NOT NULL DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS notice_date date NULL,
ADD COLUMN IF NOT EXISTS notice_by text NULL,
ADD COLUMN IF NOT EXISTS mymaps_url text NULL,
ADD COLUMN IF NOT EXISTS notice_scheduled_at timestamptz NULL;
