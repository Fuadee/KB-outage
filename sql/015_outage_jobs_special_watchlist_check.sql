alter table public.outage_jobs
add column if not exists special_watchlist_check_status text,
add column if not exists special_watchlist_check_count integer not null default 0,
add column if not exists special_watchlist_customer_ids jsonb not null default '[]'::jsonb,
add column if not exists special_watchlist_check_checked_at timestamptz,
add column if not exists special_watchlist_check_error text;
