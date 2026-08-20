-- Allow deletion of GIS Issues in the intentional no-login application.
-- Activities reference the parent with ON DELETE CASCADE, so the application
-- deletes only the issue and PostgreSQL removes its activity history atomically.

alter table public.gis_issues enable row level security;

drop policy if exists "No-auth app can delete GIS issues" on public.gis_issues;
create policy "No-auth app can delete GIS issues"
  on public.gis_issues
  for delete
  to anon
  using (true);

grant delete on table public.gis_issues to anon;
