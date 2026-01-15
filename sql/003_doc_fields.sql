ALTER TABLE outage_jobs
ADD COLUMN IF NOT EXISTS doc_issue_date date NULL,
ADD COLUMN IF NOT EXISTS doc_purpose text NULL,
ADD COLUMN IF NOT EXISTS doc_area_title text NULL,
ADD COLUMN IF NOT EXISTS doc_time_start text NULL,
ADD COLUMN IF NOT EXISTS doc_time_end text NULL,
ADD COLUMN IF NOT EXISTS doc_area_detail text NULL,
ADD COLUMN IF NOT EXISTS map_link text NULL,
ADD COLUMN IF NOT EXISTS doc_status text NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS doc_url text NULL,
ADD COLUMN IF NOT EXISTS doc_generated_at timestamptz NULL;
