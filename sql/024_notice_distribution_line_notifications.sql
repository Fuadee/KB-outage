-- Idempotency log for daily LINE assignments to distribute outage notices.
-- This is deliberately separate from outage_jobs.notice_completed_at because
-- sending an assignment and completing field distribution are different events.

create table if not exists public.line_notification_events (
  event_key text primary key,
  event_type text not null,
  job_id uuid not null references public.outage_jobs(id) on delete cascade,
  business_date date not null,
  sent_at timestamptz not null default now(),
  line_request_id text null
);

create index if not exists line_notification_events_type_date_idx
  on public.line_notification_events(event_type, business_date);

alter table public.line_notification_events enable row level security;

drop policy if exists "Service role manages LINE notification events"
  on public.line_notification_events;
create policy "Service role manages LINE notification events"
  on public.line_notification_events
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.line_notification_events is
  'Successful LINE notification events used for cron idempotency.';
comment on column public.line_notification_events.event_key is
  'Stable key such as NOTICE_DISTRIBUTION:{jobId}:{YYYY-MM-DD}.';
