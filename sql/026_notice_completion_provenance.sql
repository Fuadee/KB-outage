-- Explicit provenance for outage-notice distribution completion.
-- Migration 023 generated the same status/timestamp shape as the later UI
-- completion action, so those values cannot be distinguished by timestamps.

alter table public.outage_jobs
add column if not exists notice_completion_source text null;

comment on column public.outage_jobs.notice_completion_source is
  'Provenance of notice completion: USER for an explicit UI/API confirmation, LEGACY_BACKFILL for ambiguous data created before provenance existed.';

alter table public.outage_jobs
drop constraint if exists outage_jobs_notice_completion_source_check;

alter table public.outage_jobs
add constraint outage_jobs_notice_completion_source_check
check (
  notice_completion_source is null
  or notice_completion_source in ('USER', 'LEGACY_BACKFILL')
);

-- Existing completion-shaped rows are ambiguous because migration 023 wrote
-- notice_status and notice_completed_at without recording provenance. Mark
-- them conservatively; Daily LINE must not treat them as user-confirmed.
update public.outage_jobs
set notice_completion_source = 'LEGACY_BACKFILL'
where notice_completion_source is null
  and notice_status = 'COMPLETED'
  and notice_completed_at is not null;

-- Production verification established this exact Job as an actual completed
-- distribution. Both id and equipment code are required to make the repair
-- narrow and deterministic rather than relying on timestamp heuristics.
update public.outage_jobs
set notice_completion_source = 'USER'
where id = '198af120-342e-41ec-9bfd-45c7c3e9edfc'::uuid
  and equipment_code = 'KBB05WF-104'
  and notice_status = 'COMPLETED'
  and notice_completed_at is not null;

create or replace function public.normalize_notice_completion_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.notice_status is distinct from 'COMPLETED'
     or new.notice_completed_at is null then
    new.notice_completion_source := null;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_notice_completion_source_on_outage_jobs
  on public.outage_jobs;

create trigger normalize_notice_completion_source_on_outage_jobs
before insert or update of notice_status, notice_completed_at, notice_completion_source
on public.outage_jobs
for each row
execute function public.normalize_notice_completion_source();

