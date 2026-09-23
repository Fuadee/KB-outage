-- Image history is server-managed; existing no-login application access is unchanged.
create table public.social_announcement_images (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.outage_jobs(id) on delete cascade,
  source_path text not null,
  generated_path text not null,
  generated_at timestamptz not null default now(),
  snapshot jsonb not null
);
create index on public.social_announcement_images(job_id, generated_at desc);
alter table public.social_announcement_images enable row level security;
revoke all on public.social_announcement_images from anon, authenticated;
grant all on public.social_announcement_images to service_role;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('social-announcements', 'social-announcements', false, 20971520, array['image/png'])
on conflict (id) do nothing;

-- Atomic publication: lock the job so edits cannot race the image validation.
create or replace function public.complete_social_announcement(p_job_id uuid, p_image_id uuid, p_text text, p_confirmed boolean)
returns public.outage_jobs language plpgsql security definer set search_path = public as $$
declare j public.outage_jobs; a public.social_announcement_images; current_snapshot jsonb;
begin
  if p_confirmed is distinct from true then raise exception 'กรุณาตรวจสอบข้อมูลและภาพประชาสัมพันธ์'; end if;
  select * into strict j from public.outage_jobs where id = p_job_id for update;
  if not (j.doc_status = 'GENERATED' or j.doc_generated_at is not null)
    or not (j.notice_status in ('COMPLETED', 'SENT') or j.notice_completed_at is not null)
    or j.document_delivered_at is null then
    raise exception 'ต้องสร้างเอกสาร ส่งเอกสาร และยืนยันว่าแจกหนังสือแล้วก่อนโพสต์ Social';
  end if;
  select * into a from public.social_announcement_images where job_id = p_job_id order by generated_at desc limit 1;
  current_snapshot := jsonb_build_object('outage_date', j.outage_date, 'doc_time_start', j.doc_time_start,
    'doc_time_end', j.doc_time_end, 'doc_area_title', j.doc_area_title, 'doc_area_detail', j.doc_area_detail,
    'doc_purpose', j.doc_purpose, 'map_link', j.map_link, 'equipment_code', j.equipment_code);
  if p_image_id is null or a.id is null or a.id <> p_image_id or a.snapshot is distinct from current_snapshot then
    raise exception 'ข้อมูลดับไฟมีการแก้ไขหลังจากสร้างภาพนี้ กรุณาสร้างภาพประชาสัมพันธ์ใหม่';
  end if;
  update public.outage_jobs set social_status = 'POSTED', social_post_text = p_text,
    social_posted_at = now() where id = p_job_id returning * into j;
  return j;
end; $$;
revoke all on function public.complete_social_announcement(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.complete_social_announcement(uuid, uuid, text, boolean) to service_role;
