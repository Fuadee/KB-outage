create sequence if not exists public.gis_issue_number_seq start with 1;

create table if not exists public.gis_issues (
  id uuid primary key default gen_random_uuid(),
  issue_number text not null unique,
  feeder_code text not null,
  equipment_code text,
  issue_type text not null check (
    issue_type in (
      'EQUIPMENT_POSITION',
      'EQUIPMENT_CODE',
      'LINE_ROUTE',
      'MISSING_FROM_GIS',
      'MISSING_IN_GIS',
      'CONNECTIVITY',
      'EQUIPMENT_DETAILS',
      'OTHER'
    )
  ),
  issue_type_detail text,
  location_text text,
  description text not null,
  expected_value text,
  status text not null default 'OPEN' check (
    status in ('OPEN', 'IN_PROGRESS', 'VERIFYING', 'CLOSED')
  ),
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_name text not null,
  assignee_name text,
  found_at date not null default (timezone('Asia/Bangkok', now()))::date,
  started_at timestamptz,
  resolved_at timestamptz,
  verified_at timestamptz,
  resolution_note text,
  reference_url text,
  source_job_id uuid references public.outage_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gis_issues_other_type_detail_check check (
    issue_type <> 'OTHER' or nullif(btrim(issue_type_detail), '') is not null
  )
);

create or replace function public.set_gis_issue_number()
returns trigger
language plpgsql
as $$
begin
  if new.issue_number is null or btrim(new.issue_number) = '' then
    new.issue_number := 'GIS-' || lpad(nextval('public.gis_issue_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists gis_issues_set_issue_number on public.gis_issues;
create trigger gis_issues_set_issue_number
before insert on public.gis_issues
for each row execute function public.set_gis_issue_number();

drop trigger if exists gis_issues_set_updated_at on public.gis_issues;
create trigger gis_issues_set_updated_at
before update on public.gis_issues
for each row execute function public.set_updated_at();

create index if not exists gis_issues_status_updated_idx
  on public.gis_issues(status, updated_at desc);
create index if not exists gis_issues_feeder_idx
  on public.gis_issues(feeder_code);
create index if not exists gis_issues_type_idx
  on public.gis_issues(issue_type);
create index if not exists gis_issues_source_job_idx
  on public.gis_issues(source_job_id)
  where source_job_id is not null;

create table if not exists public.gis_issue_activities (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.gis_issues(id) on delete cascade,
  activity_type text not null check (
    activity_type in ('CREATED', 'UPDATED', 'STATUS_CHANGED')
  ),
  from_status text,
  to_status text,
  message text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists gis_issue_activities_issue_created_idx
  on public.gis_issue_activities(issue_id, created_at desc);

alter table public.gis_issues enable row level security;
alter table public.gis_issue_activities enable row level security;

drop policy if exists "Authenticated can read GIS issues" on public.gis_issues;
create policy "Authenticated can read GIS issues"
  on public.gis_issues for select to authenticated using (true);

drop policy if exists "Authenticated can create GIS issues" on public.gis_issues;
create policy "Authenticated can create GIS issues"
  on public.gis_issues for insert to authenticated with check (reporter_id = auth.uid());

drop policy if exists "Authenticated can update GIS issues" on public.gis_issues;
create policy "Authenticated can update GIS issues"
  on public.gis_issues for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated can read GIS issue activities" on public.gis_issue_activities;
create policy "Authenticated can read GIS issue activities"
  on public.gis_issue_activities for select to authenticated using (true);

drop policy if exists "Authenticated can create GIS issue activities" on public.gis_issue_activities;
create policy "Authenticated can create GIS issue activities"
  on public.gis_issue_activities for insert to authenticated with check (actor_id = auth.uid());
