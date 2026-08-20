-- GIS Issues access for the application's intentional no-login architecture.
-- The browser continues to call Next.js API routes; those routes use the anon
-- client and keep field validation/status-transition rules server-side.
-- RLS remains enabled and DELETE is intentionally not granted.

alter table public.gis_issues
  alter column reporter_id drop not null;

alter table public.gis_issue_activities
  alter column actor_id drop not null;

alter table public.gis_issues enable row level security;
alter table public.gis_issue_activities enable row level security;

drop policy if exists "Authenticated can read GIS issues" on public.gis_issues;
drop policy if exists "Authenticated can create GIS issues" on public.gis_issues;
drop policy if exists "Authenticated can update GIS issues" on public.gis_issues;
drop policy if exists "Authenticated can read GIS issue activities" on public.gis_issue_activities;
drop policy if exists "Authenticated can create GIS issue activities" on public.gis_issue_activities;

drop policy if exists "No-auth app can read GIS issues" on public.gis_issues;
create policy "No-auth app can read GIS issues"
  on public.gis_issues
  for select
  to anon
  using (true);

drop policy if exists "No-auth app can create GIS issues" on public.gis_issues;
create policy "No-auth app can create GIS issues"
  on public.gis_issues
  for insert
  to anon
  with check (
    reporter_id is null
    and status = 'OPEN'
    and nullif(btrim(reporter_name), '') is not null
  );

drop policy if exists "No-auth app can update GIS issues" on public.gis_issues;
create policy "No-auth app can update GIS issues"
  on public.gis_issues
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "No-auth app can read GIS issue activities" on public.gis_issue_activities;
create policy "No-auth app can read GIS issue activities"
  on public.gis_issue_activities
  for select
  to anon
  using (true);

drop policy if exists "No-auth app can create GIS issue activities" on public.gis_issue_activities;
create policy "No-auth app can create GIS issue activities"
  on public.gis_issue_activities
  for insert
  to anon
  with check (
    actor_id is null
    and nullif(btrim(actor_name), '') is not null
  );

revoke all on table public.gis_issues from anon;
revoke all on table public.gis_issue_activities from anon;
grant select on table public.gis_issues to anon;
grant insert (
  feeder_code, equipment_code, issue_type, issue_type_detail, location_text,
  description, expected_value, reporter_name, assignee_name, found_at,
  reference_url, source_job_id
) on table public.gis_issues to anon;
grant update (
  feeder_code, equipment_code, issue_type, issue_type_detail, location_text,
  description, expected_value, status, assignee_name, found_at, started_at,
  resolved_at, verified_at, resolution_note, reference_url
) on table public.gis_issues to anon;
grant select on table public.gis_issue_activities to anon;
grant insert (
  issue_id, activity_type, from_status, to_status, message, actor_name
) on table public.gis_issue_activities to anon;
grant usage, select on sequence public.gis_issue_number_seq to anon;
