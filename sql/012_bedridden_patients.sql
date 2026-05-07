create table if not exists public.bedridden_patients (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  contact_name text,
  contact_phone text,
  address text,
  subdistrict text,
  latitude numeric,
  longitude numeric,
  power_dependency_note text,
  care_note text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists bedridden_patients_set_updated_at on public.bedridden_patients;
create trigger bedridden_patients_set_updated_at
before update on public.bedridden_patients
for each row execute function public.set_updated_at();

alter table public.bedridden_patients enable row level security;

drop policy if exists "Public access to bedridden_patients" on public.bedridden_patients;
create policy "Public access to bedridden_patients"
  on public.bedridden_patients
  for all
  to anon
  using (true)
  with check (true);
