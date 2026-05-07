alter table public.outage_jobs
add column if not exists vulnerable_check_status text,
add column if not exists vulnerable_check_count integer not null default 0,
add column if not exists vulnerable_check_checked_at timestamptz,
add column if not exists vulnerable_check_error text,
add column if not exists vulnerable_patient_ids jsonb not null default '[]'::jsonb;
