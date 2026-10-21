-- Run after existing migrations through 030. Safe whether 031 ran or not.
-- No legacy backfill or name matching. Apply before deploying the app.
begin;

-- Include 031's additive schema so this migration does not assume it was run.
alter table public.outage_jobs
  add column if not exists document_delivered_by_person_id uuid null,
  add column if not exists document_delivered_by_department text null,
  add column if not exists document_delivery_sender_status text null,
  add column if not exists document_delivery_unknown_reason text null,
  add column if not exists document_delivery_confirmed_at timestamptz null;

do $$
begin
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.outage_jobs'::regclass
      and conname = 'outage_jobs_document_delivered_by_person_id_fkey') then
    alter table public.outage_jobs
      add constraint outage_jobs_document_delivered_by_person_id_fkey
      foreign key (document_delivered_by_person_id) references public.people(id) on delete restrict;
  end if;
end;
$$;

create index if not exists outage_jobs_document_delivered_by_person_idx
  on public.outage_jobs(document_delivered_by_person_id)
  where document_delivered_by_person_id is not null;

alter table public.outage_jobs drop constraint if exists outage_jobs_document_delivery_sender_check;
alter table public.outage_jobs add constraint outage_jobs_document_delivery_sender_check check (
  (document_delivery_sender_status is null or document_delivery_sender_status in ('PERSON', 'UNKNOWN'))
  and (document_delivery_sender_status is distinct from 'UNKNOWN' or (
    document_delivered_at is not null
    and document_received_at is not null
    and document_delivered_at >= document_received_at
    and document_delivered_by_person_id is null
    and document_delivered_by is null
    and document_delivered_by_department is null
    and nullif(btrim(document_delivery_unknown_reason), '') is not null
    and length(document_delivery_unknown_reason) <= 1000
    and document_delivery_confirmed_at is not null
    and document_delivered_at <= document_delivery_confirmed_at
  ))
  and (document_delivery_sender_status is distinct from 'PERSON' or (
    document_delivered_at is not null
    and document_delivered_by_person_id is not null
    and nullif(btrim(document_delivered_by), '') is not null
  ))
  and (document_delivery_sender_status is not distinct from 'UNKNOWN' or (
    document_delivery_unknown_reason is null and document_delivery_confirmed_at is null
  ))
);

comment on column public.outage_jobs.document_delivery_sender_status is
  'PERSON or UNKNOWN for explicit sender recording. NULL preserves pre-migration records without reclassification.';
comment on column public.outage_jobs.document_delivery_confirmed_at is
  'Server timestamp of explicit confirmation that physical delivery occurred. Does not authenticate the recorder.';
comment on column public.outage_jobs.document_delivered_by is
  'Recorded name snapshot, including legacy text. UNKNOWN always uses NULL, never a fabricated name.';

create table if not exists public.outage_job_document_delivery_audit (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.outage_jobs(id) on delete cascade,
  before_state jsonb null,
  after_state jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  actor_authenticated boolean not null default false check (actor_authenticated = false)
);
create index if not exists outage_job_document_delivery_audit_job_created_idx
  on public.outage_job_document_delivery_audit(job_id, created_at desc);

alter table public.outage_job_document_delivery_audit enable row level security;
revoke all on table public.outage_job_document_delivery_audit from public, anon, authenticated;
grant select, insert on table public.outage_job_document_delivery_audit to service_role;
drop policy if exists "Service role delivery audit" on public.outage_job_document_delivery_audit;
create policy "Service role delivery audit" on public.outage_job_document_delivery_audit
  for all to service_role using (true) with check (true);

-- Retain the existing rollback function (023 or 031) and its workflow rules.
-- Clear added metadata when that function clears delivery, even without 031.
create or replace function public.clear_document_delivery_sender_on_reset()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.document_delivered_at is null and old.document_delivered_at is not null then
    new.document_delivered_by_person_id := null;
    new.document_delivered_by_department := null;
    new.document_delivery_sender_status := null;
    new.document_delivery_unknown_reason := null;
    new.document_delivery_confirmed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists clear_document_delivery_sender_on_reset on public.outage_jobs;
create trigger clear_document_delivery_sender_on_reset
  before update of document_delivered_at on public.outage_jobs
  for each row execute function public.clear_document_delivery_sender_on_reset();

create or replace function public.audit_document_delivery_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_keys text[] := array[
    'document_delivered_at', 'document_delivered_by',
    'document_delivered_by_person_id', 'document_delivered_by_department',
    'document_delivery_sender_status', 'document_delivery_unknown_reason',
    'document_delivery_confirmed_at', 'document_delivery_note'
  ];
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, value) into v_before
      from jsonb_each(to_jsonb(old)) where key = any(v_keys);
  end if;
  select jsonb_object_agg(key, value) into v_after
    from jsonb_each(to_jsonb(new)) where key = any(v_keys);
  if (tg_op = 'UPDATE' and v_before is distinct from v_after)
    or (tg_op = 'INSERT' and new.document_delivered_at is not null) then
    insert into public.outage_job_document_delivery_audit(job_id, before_state, after_state)
      values (new.id, v_before, v_after);
  end if;
  return new;
end;
$$;
revoke all on function public.audit_document_delivery_change() from public, anon, authenticated;
drop trigger if exists audit_document_delivery_change on public.outage_jobs;
create trigger audit_document_delivery_change after insert or update on public.outage_jobs
  for each row execute function public.audit_document_delivery_change();

commit;
