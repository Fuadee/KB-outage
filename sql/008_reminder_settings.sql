create table if not exists public.reminder_settings (
  id integer primary key,
  timezone text not null default 'Asia/Bangkok',
  lead_reminder_enabled boolean not null default true,
  lead_reminder_days integer not null default 5,
  lead_reminder_time text not null default '08:00',
  same_day_reminder_enabled boolean not null default true,
  same_day_reminder_time text not null default '14:30',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_settings_timezone_check check (timezone = 'Asia/Bangkok'),
  constraint reminder_settings_lead_days_check check (lead_reminder_days >= 0 and lead_reminder_days <= 30),
  constraint reminder_settings_lead_time_check check (lead_reminder_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint reminder_settings_same_day_time_check check (same_day_reminder_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
);

drop trigger if exists reminder_settings_set_updated_at on public.reminder_settings;
create trigger reminder_settings_set_updated_at
before update on public.reminder_settings
for each row execute function public.set_updated_at();

insert into public.reminder_settings (
  id,
  timezone,
  lead_reminder_enabled,
  lead_reminder_days,
  lead_reminder_time,
  same_day_reminder_enabled,
  same_day_reminder_time
)
values (1, 'Asia/Bangkok', true, 5, '08:00', true, '14:30')
on conflict (id) do nothing;

alter table public.reminder_settings enable row level security;

drop policy if exists "Public access to reminder_settings" on public.reminder_settings;
create policy "Public access to reminder_settings"
  on public.reminder_settings
  for all
  to anon
  using (true)
  with check (true);
