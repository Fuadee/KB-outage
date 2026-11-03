-- Apply after 032. No historical rows are rewritten or deleted.
begin;
alter table public.outage_jobs add column if not exists outage_periods jsonb null;
comment on column public.outage_jobs.outage_periods is
  'Authoritative ordered same-day [{start_time: HH:mm, end_time: HH:mm}]. NULL uses legacy fields; legacy fields mirror FIRST period only, never the overall envelope.';

create or replace function public.normalize_outage_periods(periods jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare item jsonb; result jsonb := '[]'; previous_end text; start_text text; end_text text;
begin
  if periods is null or jsonb_typeof(periods) <> 'array' then
    raise exception 'กรุณาระบุช่วงเวลาดับไฟเป็นรายการ';
  end if;
  if jsonb_array_length(periods) = 0 then raise exception 'ต้องมีช่วงเวลาดับไฟอย่างน้อย 1 ช่วง'; end if;
  for item in select value from jsonb_array_elements(periods) loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'start_time') is distinct from 'string'
      or jsonb_typeof(item->'end_time') is distinct from 'string' then
      raise exception 'รูปแบบช่วงเวลาดับไฟไม่ถูกต้อง';
    end if;
    start_text := item->>'start_time'; end_text := item->>'end_time';
    if start_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or end_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'เวลาต้องเป็น HH:mm';
    end if;
    if start_text >= end_text then raise exception 'เวลาเริ่มต้องน้อยกว่าเวลาสิ้นสุด ไม่รองรับช่วงเวลาข้ามเที่ยงคืน'; end if;
  end loop;
  for item in select value from jsonb_array_elements(periods) order by value->>'start_time' loop
    if previous_end is not null and item->>'start_time' < previous_end then raise exception 'ช่วงเวลาดับไฟซ้อนทับกัน'; end if;
    previous_end := item->>'end_time';
    result := result || jsonb_build_array(jsonb_build_object('start_time', item->>'start_time', 'end_time', previous_end));
  end loop;
  return result;
end; $$;

create or replace function public.sync_outage_periods()
returns trigger language plpgsql set search_path = public as $$
declare legacy_changed boolean := false; periods_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    legacy_changed := new.doc_time_start is distinct from old.doc_time_start or new.doc_time_end is distinct from old.doc_time_end;
    periods_changed := new.outage_periods is distinct from old.outage_periods;
    if not legacy_changed and not periods_changed then return new; end if;
    if old.outage_periods is not null and new.outage_periods is null then
      raise exception 'ไม่สามารถล้างรายการช่วงเวลา กรุณาระบุอย่างน้อย 1 ช่วง';
    end if;
    if legacy_changed and not periods_changed then
      if jsonb_array_length(old.outage_periods) > 1 then
        raise exception 'งานนี้มีหลายช่วงเวลาดับไฟ ต้องแก้ไขผ่าน outage_periods';
      end if;
      new.outage_periods := jsonb_build_array(jsonb_build_object('start_time', new.doc_time_start, 'end_time', new.doc_time_end));
    end if;
  end if;
  if new.outage_periods is null then
    -- Drafts and historical records remain readable through the legacy fallback.
    if new.doc_time_start is null and new.doc_time_end is null then return new; end if;
    new.outage_periods := jsonb_build_array(jsonb_build_object('start_time', new.doc_time_start, 'end_time', new.doc_time_end));
  end if;
  new.outage_periods := public.normalize_outage_periods(new.outage_periods);
  new.doc_time_start := new.outage_periods->0->>'start_time';
  new.doc_time_end := new.outage_periods->0->>'end_time';
  return new;
end; $$;
drop trigger if exists outage_jobs_sync_periods on public.outage_jobs;
create trigger outage_jobs_sync_periods before insert or update of outage_periods, doc_time_start, doc_time_end
  on public.outage_jobs for each row execute function public.sync_outage_periods();

-- Preserve publication rules and compare every period while holding the job lock.
create or replace function public.complete_social_announcement(p_job_id uuid, p_image_id uuid, p_text text, p_confirmed boolean)
returns public.outage_jobs language plpgsql security definer set search_path = public as $$
declare j public.outage_jobs; a public.social_announcement_images; current_snapshot jsonb;
begin
  if p_confirmed is distinct from true then raise exception 'กรุณาตรวจสอบข้อมูลและภาพประชาสัมพันธ์'; end if;
  select * into strict j from public.outage_jobs where id = p_job_id for update;
  if j.social_status = 'POSTED' or j.social_posted_at is not null then
    raise exception 'งานนี้บันทึกว่าโพสต์ Social แล้ว';
  end if;
  if not (j.doc_status = 'GENERATED' or j.doc_generated_at is not null)
    or not (j.notice_status in ('COMPLETED', 'SENT') or j.notice_completed_at is not null)
    or j.document_delivered_at is null then
    raise exception 'ต้องสร้างเอกสาร ส่งเอกสาร และยืนยันว่าแจกหนังสือแล้วก่อนโพสต์ Social';
  end if;
  select * into a from public.social_announcement_images where job_id = p_job_id order by generated_at desc limit 1;
  current_snapshot := jsonb_build_object('outage_date', j.outage_date, 'doc_time_start', j.doc_time_start,
    'doc_time_end', j.doc_time_end, 'doc_area_title', j.doc_area_title, 'doc_area_detail', j.doc_area_detail,
    'doc_purpose', j.doc_purpose, 'map_link', j.map_link, 'equipment_code', j.equipment_code);
  -- Omit the extra key for one-period jobs to keep existing single-period assets valid.
  if jsonb_array_length(j.outage_periods) > 1 then
    current_snapshot := current_snapshot || jsonb_build_object('outage_periods', j.outage_periods);
  end if;
  if p_image_id is null or a.id is null or a.id <> p_image_id or (a.snapshot - 'map_view') is distinct from current_snapshot then
    raise exception 'ข้อมูลดับไฟมีการแก้ไขหลังจากสร้างภาพนี้ กรุณาสร้างภาพประชาสัมพันธ์ใหม่';
  end if;
  update public.outage_jobs set social_status = 'POSTED', social_post_text = p_text,
    social_posted_at = now() where id = p_job_id returning * into j;
  return j;
end; $$;
revoke all on function public.complete_social_announcement(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.complete_social_announcement(uuid, uuid, text, boolean) to service_role;
notify pgrst, 'reload schema';
commit;
