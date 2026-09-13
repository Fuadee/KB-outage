create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  department text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_full_name_check check (nullif(btrim(full_name), '') is not null),
  constraint people_department_check check (
    department in (
      'แผนกปฏิบัติการ',
      'แผนกก่อสร้าง',
      'กฟส.อ่าวนาง'
    )
  )
);

drop trigger if exists people_set_updated_at on public.people;
create trigger people_set_updated_at
before update on public.people
for each row execute function public.set_updated_at();

create index if not exists people_department_active_name_idx
  on public.people(department, is_active, full_name);

alter table public.outage_jobs
add column if not exists work_supervisor_person_id uuid null;

alter table public.outage_jobs
add column if not exists notice_by_person_id uuid null;

alter table public.outage_jobs
drop constraint if exists outage_jobs_work_supervisor_person_id_fkey;

alter table public.outage_jobs
add constraint outage_jobs_work_supervisor_person_id_fkey
foreign key (work_supervisor_person_id)
references public.people(id)
on delete restrict;

alter table public.outage_jobs
drop constraint if exists outage_jobs_notice_by_person_id_fkey;

alter table public.outage_jobs
add constraint outage_jobs_notice_by_person_id_fkey
foreign key (notice_by_person_id)
references public.people(id)
on delete restrict;

create index if not exists outage_jobs_work_supervisor_person_idx
  on public.outage_jobs(work_supervisor_person_id)
  where work_supervisor_person_id is not null;

create index if not exists outage_jobs_notice_by_person_idx
  on public.outage_jobs(notice_by_person_id)
  where notice_by_person_id is not null;

create or replace function public.clear_notice_person_when_incomplete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.notice_status is distinct from 'COMPLETED'
     or new.notice_completed_at is null
     or new.notice_by is null then
    new.notice_by_person_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_notice_person_when_incomplete_on_outage_jobs
  on public.outage_jobs;

create trigger clear_notice_person_when_incomplete_on_outage_jobs
before insert or update of notice_status, notice_completed_at, notice_by, notice_by_person_id
on public.outage_jobs
for each row execute function public.clear_notice_person_when_incomplete();

comment on table public.people is
  'Master list of personnel. Department reuses outage_jobs.responsible_unit values; work context determines usage.';

comment on column public.outage_jobs.work_supervisor_person_id is
  'Selected work supervisor from people. Legacy work_supervisor_name remains as a display fallback.';

comment on column public.outage_jobs.notice_by_person_id is
  'Actual notice distributor selected from people when the workflow requires a named person. Legacy notice_by remains as a display fallback.';

alter table public.people enable row level security;

drop policy if exists "No-auth app can read people" on public.people;
create policy "No-auth app can read people"
  on public.people
  for select
  to anon
  using (true);

revoke all on table public.people from anon;
grant select on table public.people to anon;
