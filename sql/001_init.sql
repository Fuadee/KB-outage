create table if not exists public.outage_jobs (
  id uuid primary key default gen_random_uuid(),
  outage_date date not null,
  equipment_code text not null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists outage_jobs_set_updated_at on public.outage_jobs;
create trigger outage_jobs_set_updated_at
before update on public.outage_jobs
for each row execute function public.set_updated_at();

alter table public.outage_jobs enable row level security;

drop policy if exists "Public access to outage_jobs" on public.outage_jobs;
create policy "Public access to outage_jobs"
  on public.outage_jobs
  for all
  to anon
  using (true)
  with check (true);
