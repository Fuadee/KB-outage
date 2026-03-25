alter table if exists public.reminder_settings
  alter column same_day_reminder_time set default '08:00';

update public.reminder_settings
set same_day_reminder_time = '08:00'
where id = 1
  and timezone = 'Asia/Bangkok'
  and same_day_reminder_time <> '08:00';
