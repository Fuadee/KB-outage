alter table public.outage_jobs
  add column if not exists nakhon_status text not null default 'PENDING',
  add column if not exists nakhon_notified_date date null,
  add column if not exists nakhon_memo_no text null,
  add column if not exists doc_status text not null default 'PENDING',
  add column if not exists doc_requested_at timestamptz null;

alter table public.outage_jobs
  add constraint outage_jobs_nakhon_notified_check
  check (
    nakhon_status <> 'NOTIFIED'
    or (nakhon_notified_date is not null and nakhon_memo_no is not null)
  );
