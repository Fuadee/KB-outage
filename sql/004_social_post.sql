ALTER TABLE outage_jobs
ADD COLUMN IF NOT EXISTS social_status text NOT NULL DEFAULT 'DRAFT',
ADD COLUMN IF NOT EXISTS social_post_text text NULL,
ADD COLUMN IF NOT EXISTS social_posted_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS social_approved_at timestamptz NULL;
