ALTER TABLE outage_jobs
ADD COLUMN nakhon_status text NOT NULL DEFAULT 'PENDING',
ADD COLUMN nakhon_notified_date date NULL,
ADD COLUMN nakhon_memo_no text NULL,
ADD COLUMN doc_status text NOT NULL DEFAULT 'PENDING',
ADD COLUMN doc_requested_at timestamptz NULL;
