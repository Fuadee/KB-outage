-- Separate a planned book-distribution date from confirmed completion, and add
-- an atomic, audited rollback operation. Existing rows are backfilled to their
-- previously displayed state so the migration does not silently regress jobs.

alter table public.outage_jobs
add column if not exists notice_completed_at timestamptz null;

comment on column public.outage_jobs.notice_date is
  'Planned date for distributing outage notice letters.';
comment on column public.outage_jobs.notice_by is
  'Actual distributor recorded when distribution is confirmed complete.';
comment on column public.outage_jobs.notice_completed_at is
  'When outage notice letter distribution was confirmed complete.';

update public.outage_jobs
set
  notice_status = 'COMPLETED',
  notice_completed_at = coalesce(
    notice_completed_at,
    notice_scheduled_at,
    notice_date::timestamp at time zone 'Asia/Bangkok'
  )
where notice_status in ('SCHEDULED', 'SENT')
  and notice_completed_at is null;

create table if not exists public.outage_job_workflow_audit (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.outage_jobs(id) on delete cascade,
  action text not null check (action = 'WORKFLOW_ROLLBACK'),
  from_step text not null,
  to_step text not null,
  reason text not null,
  before_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists outage_job_workflow_audit_job_created_idx
  on public.outage_job_workflow_audit(job_id, created_at desc);

alter table public.outage_job_workflow_audit enable row level security;

drop policy if exists "Service role full access workflow audit"
  on public.outage_job_workflow_audit;
create policy "Service role full access workflow audit"
  on public.outage_job_workflow_audit
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.rollback_outage_job_workflow(
  p_job_id uuid,
  p_target_step text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.outage_jobs%rowtype;
  v_updated public.outage_jobs%rowtype;
  v_audit public.outage_job_workflow_audit%rowtype;
  v_from_step text;
  v_current_rank integer;
  v_target_rank integer;
  v_reason text;
  v_before_state jsonb;
begin
  v_reason := nullif(btrim(p_reason), '');
  if v_reason is null or length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'Invalid rollback reason';
  end if;

  v_target_rank := case p_target_step
    when 'DOCUMENT_CREATED' then 1
    when 'DOCUMENT_RECEIVED' then 2
    when 'DOCUMENT_SENT' then 3
    when 'DELIVERY_COMPLETED' then 4
    when 'SOCIAL_POSTED' then 5
    else null
  end;
  if v_target_rank is null then
    raise exception using errcode = '22023', message = 'Invalid rollback target';
  end if;

  select * into v_current
  from public.outage_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Job not found';
  end if;

  if v_current.is_closed then
    v_from_step := 'CLOSED';
    v_current_rank := 6;
  elsif v_current.social_status = 'POSTED' or v_current.social_posted_at is not null then
    v_from_step := 'SOCIAL_POSTED';
    v_current_rank := 5;
  elsif v_current.notice_status = 'COMPLETED' or v_current.notice_completed_at is not null then
    v_from_step := 'DELIVERY_COMPLETED';
    v_current_rank := 4;
  elsif v_current.document_delivered_at is not null then
    v_from_step := 'DOCUMENT_SENT';
    v_current_rank := 3;
  elsif v_current.document_received_at is not null then
    v_from_step := 'DOCUMENT_RECEIVED';
    v_current_rank := 2;
  elsif v_current.doc_status = 'GENERATED' or v_current.doc_generated_at is not null then
    v_from_step := 'DOCUMENT_CREATED';
    v_current_rank := 1;
  else
    v_from_step := 'DRAFT';
    v_current_rank := 0;
  end if;

  if v_target_rank >= v_current_rank then
    raise exception using errcode = '22023', message = 'Rollback target is not before current workflow step';
  end if;

  if (p_target_step = 'DOCUMENT_CREATED'
      and not (v_current.doc_status = 'GENERATED' or v_current.doc_generated_at is not null))
    or (p_target_step = 'DOCUMENT_RECEIVED' and v_current.document_received_at is null)
    or (p_target_step = 'DOCUMENT_SENT' and v_current.document_delivered_at is null)
    or (p_target_step = 'DELIVERY_COMPLETED'
      and not (v_current.notice_status in ('COMPLETED', 'SENT') or v_current.notice_completed_at is not null))
    or (p_target_step = 'SOCIAL_POSTED'
      and not (v_current.social_status = 'POSTED' or v_current.social_posted_at is not null))
  then
    raise exception using errcode = '22023', message = 'Rollback target source state is missing';
  end if;

  v_before_state := jsonb_build_object(
    'document_received_at', v_current.document_received_at,
    'document_received_by', v_current.document_received_by,
    'document_delivered_at', v_current.document_delivered_at,
    'document_delivered_by', v_current.document_delivered_by,
    'document_delivery_note', v_current.document_delivery_note,
    'notice_status', v_current.notice_status,
    'notice_date', v_current.notice_date,
    'notice_by', v_current.notice_by,
    'notice_scheduled_at', v_current.notice_scheduled_at,
    'notice_completed_at', v_current.notice_completed_at,
    'social_status', v_current.social_status,
    'social_post_text', v_current.social_post_text,
    'social_posted_at', v_current.social_posted_at,
    'social_approved_at', v_current.social_approved_at,
    'is_closed', v_current.is_closed,
    'closed_at', v_current.closed_at,
    'closed_by', v_current.closed_by
  );

  update public.outage_jobs
  set
    document_received_at = case when v_target_rank < 2 then null else document_received_at end,
    document_received_by = case when v_target_rank < 2 then null else document_received_by end,
    document_delivered_at = case when v_target_rank < 3 then null else document_delivered_at end,
    document_delivered_by = case when v_target_rank < 3 then null else document_delivered_by end,
    document_delivery_note = case when v_target_rank < 3 then null else document_delivery_note end,
    notice_status = case
      when v_target_rank < 3 then 'NONE'
      when v_target_rank = 3 then
        case when notice_date is not null or notice_scheduled_at is not null then 'SCHEDULED' else 'NONE' end
      else notice_status
    end,
    notice_date = case when v_target_rank < 3 then null else notice_date end,
    notice_scheduled_at = case when v_target_rank < 3 then null else notice_scheduled_at end,
    notice_by = case when v_target_rank < 4 then null else notice_by end,
    notice_completed_at = case when v_target_rank < 4 then null else notice_completed_at end,
    social_status = case when v_target_rank < 5 then 'DRAFT' else social_status end,
    social_post_text = case when v_target_rank < 5 then null else social_post_text end,
    social_posted_at = case when v_target_rank < 5 then null else social_posted_at end,
    social_approved_at = case when v_target_rank < 5 then null else social_approved_at end,
    is_closed = false,
    closed_at = null,
    closed_by = null
  where id = p_job_id
  returning * into v_updated;

  insert into public.outage_job_workflow_audit (
    job_id, action, from_step, to_step, reason, before_state
  ) values (
    p_job_id, 'WORKFLOW_ROLLBACK', v_from_step, p_target_step, v_reason, v_before_state
  ) returning * into v_audit;

  return jsonb_build_object(
    'job', to_jsonb(v_updated),
    'audit', to_jsonb(v_audit)
  );
end;
$$;

revoke all on function public.rollback_outage_job_workflow(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.rollback_outage_job_workflow(uuid, text, text)
  to service_role;
