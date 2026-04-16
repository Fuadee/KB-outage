create table if not exists public.delivery_batches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.outage_jobs(id) on delete cascade,
  access_token text not null unique,
  created_by uuid null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_batches_job_unique unique (job_id)
);

create table if not exists public.delivery_targets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.delivery_batches(id) on delete cascade,
  company_name text not null,
  contact_name text null,
  note text null,
  latitude double precision null,
  longitude double precision null,
  map_link text null,
  status text not null default 'pending' check (status in ('pending', 'delivered')),
  proof_image_url text null,
  delivered_at timestamptz null,
  delivered_by_name text null,
  sort_order integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists delivery_batches_set_updated_at on public.delivery_batches;
create trigger delivery_batches_set_updated_at
before update on public.delivery_batches
for each row execute function public.set_updated_at();

drop trigger if exists delivery_targets_set_updated_at on public.delivery_targets;
create trigger delivery_targets_set_updated_at
before update on public.delivery_targets
for each row execute function public.set_updated_at();

create index if not exists delivery_targets_batch_id_idx
  on public.delivery_targets(batch_id);

create index if not exists delivery_targets_batch_status_idx
  on public.delivery_targets(batch_id, status);

alter table public.delivery_batches enable row level security;
alter table public.delivery_targets enable row level security;

drop policy if exists "Service role full access delivery_batches" on public.delivery_batches;
create policy "Service role full access delivery_batches"
  on public.delivery_batches
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role full access delivery_targets" on public.delivery_targets;
create policy "Service role full access delivery_targets"
  on public.delivery_targets
  for all
  to service_role
  using (true)
  with check (true);
