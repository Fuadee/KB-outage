create table if not exists public.special_watchlist_customers (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  contact_name text,
  contact_phone text,
  address text,
  subdistrict text,
  latitude numeric,
  longitude numeric,
  impact_reason text,
  care_note text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists special_watchlist_customers_status_idx
  on public.special_watchlist_customers(status);

create index if not exists special_watchlist_customers_created_at_idx
  on public.special_watchlist_customers(created_at desc);

create or replace function public.set_special_watchlist_customers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_special_watchlist_customers_updated_at
  on public.special_watchlist_customers;

create trigger trg_special_watchlist_customers_updated_at
before update on public.special_watchlist_customers
for each row execute function public.set_special_watchlist_customers_updated_at();
