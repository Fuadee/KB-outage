create extension if not exists pgcrypto with schema extensions;

create or replace function public.assert_gis_noauth_rpc_secret(p_rpc_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_rpc_secret is null
    or encode(extensions.digest(p_rpc_secret, 'sha256'), 'hex') <>
      '8515749b7d2a78e14cce8b8e6f512d80e8b78b42150160336b5699a7a83b08fd'
  then
    raise insufficient_privilege using message = 'Invalid GIS RPC secret';
  end if;
end;
$$;

revoke all on function public.assert_gis_noauth_rpc_secret(text) from public, anon, authenticated;

create or replace function public.gis_list_issues_noauth(
  p_rpc_secret text,
  p_query text default null,
  p_status text default null,
  p_feeder text default null,
  p_issue_type text default null,
  p_source_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data jsonb;
  v_counts jsonb;
  v_feeders jsonb;
begin
  perform public.assert_gis_noauth_rpc_secret(p_rpc_secret);

  select coalesce(jsonb_agg(row_data order by updated_at desc), '[]'::jsonb)
  into v_data
  from (
    select
      g.updated_at,
      to_jsonb(g) || jsonb_build_object(
        'source_job',
        case when j.id is null then null else jsonb_build_object(
          'id', j.id,
          'equipment_code', j.equipment_code,
          'outage_date', j.outage_date,
          'doc_area_title', j.doc_area_title
        ) end
      ) as row_data
    from public.gis_issues g
    left join public.outage_jobs j on j.id = g.source_job_id
    where (p_status is null or g.status = p_status)
      and (p_feeder is null or g.feeder_code = p_feeder)
      and (p_issue_type is null or g.issue_type = p_issue_type)
      and (p_source_job_id is null or g.source_job_id = p_source_job_id)
      and (
        p_query is null
        or concat_ws(' ', g.issue_number, g.feeder_code, g.equipment_code,
          g.location_text, g.description, g.expected_value, g.assignee_name)
          ilike '%' || p_query || '%'
      )
  ) filtered;

  select jsonb_build_object(
    'OPEN', count(*) filter (where status = 'OPEN'),
    'IN_PROGRESS', count(*) filter (where status = 'IN_PROGRESS'),
    'VERIFYING', count(*) filter (where status = 'VERIFYING'),
    'CLOSED', count(*) filter (where status = 'CLOSED')
  ) into v_counts
  from public.gis_issues;

  select coalesce(jsonb_agg(feeder_code order by feeder_code), '[]'::jsonb)
  into v_feeders
  from (select distinct feeder_code from public.gis_issues) feeders;

  return jsonb_build_object('data', v_data, 'counts', v_counts, 'feeders', v_feeders);
end;
$$;

create or replace function public.gis_get_issue_noauth(
  p_rpc_secret text,
  p_issue_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue jsonb;
  v_activities jsonb;
begin
  perform public.assert_gis_noauth_rpc_secret(p_rpc_secret);

  select to_jsonb(g) || jsonb_build_object(
    'source_job',
    case when j.id is null then null else jsonb_build_object(
      'id', j.id,
      'equipment_code', j.equipment_code,
      'outage_date', j.outage_date,
      'doc_area_title', j.doc_area_title
    ) end
  )
  into v_issue
  from public.gis_issues g
  left join public.outage_jobs j on j.id = g.source_job_id
  where g.id = p_issue_id;

  if v_issue is null then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into v_activities
  from public.gis_issue_activities a
  where a.issue_id = p_issue_id;

  return jsonb_build_object('issue', v_issue, 'activities', v_activities);
end;
$$;

create or replace function public.gis_create_issue_noauth(
  p_rpc_secret text,
  p_actor_name text,
  p_feeder_code text,
  p_equipment_code text,
  p_issue_type text,
  p_issue_type_detail text,
  p_location_text text,
  p_description text,
  p_expected_value text,
  p_assignee_name text,
  p_found_at date,
  p_reference_url text,
  p_source_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue public.gis_issues%rowtype;
begin
  perform public.assert_gis_noauth_rpc_secret(p_rpc_secret);

  p_actor_name := nullif(btrim(p_actor_name), '');
  p_feeder_code := nullif(upper(btrim(p_feeder_code)), '');
  p_equipment_code := nullif(upper(btrim(p_equipment_code)), '');
  p_issue_type_detail := nullif(btrim(p_issue_type_detail), '');
  p_location_text := nullif(btrim(p_location_text), '');
  p_description := nullif(btrim(p_description), '');
  p_expected_value := nullif(btrim(p_expected_value), '');
  p_assignee_name := nullif(btrim(p_assignee_name), '');
  p_reference_url := nullif(btrim(p_reference_url), '');

  if p_actor_name is null or length(p_actor_name) > 200 then
    raise check_violation using message = 'Invalid actor name';
  end if;
  if p_feeder_code is null or length(p_feeder_code) > 100 then
    raise check_violation using message = 'Invalid feeder code';
  end if;
  if p_issue_type not in ('EQUIPMENT_POSITION', 'EQUIPMENT_CODE', 'LINE_ROUTE',
    'MISSING_FROM_GIS', 'MISSING_IN_GIS', 'CONNECTIVITY', 'EQUIPMENT_DETAILS', 'OTHER') then
    raise check_violation using message = 'Invalid issue type';
  end if;
  if p_issue_type = 'OTHER' and p_issue_type_detail is null then
    raise check_violation using message = 'Issue type detail is required';
  end if;
  if p_description is null or length(p_description) > 10000 then
    raise check_violation using message = 'Invalid description';
  end if;
  if p_found_at is null then
    raise check_violation using message = 'Found date is required';
  end if;
  if p_reference_url is not null
    and (length(p_reference_url) > 2048 or p_reference_url !~* '^https?://') then
    raise check_violation using message = 'Invalid reference URL';
  end if;

  insert into public.gis_issues (
    feeder_code, equipment_code, issue_type, issue_type_detail, location_text,
    description, expected_value, status, reporter_id, reporter_name,
    assignee_name, found_at, reference_url, source_job_id
  ) values (
    p_feeder_code, p_equipment_code, p_issue_type, p_issue_type_detail, p_location_text,
    p_description, p_expected_value, 'OPEN', null, p_actor_name,
    p_assignee_name, p_found_at, p_reference_url, p_source_job_id
  ) returning * into v_issue;

  insert into public.gis_issue_activities (
    issue_id, activity_type, from_status, to_status, message, actor_id, actor_name
  ) values (
    v_issue.id, 'CREATED', null, 'OPEN', 'สร้าง Issue', null, p_actor_name
  );

  return to_jsonb(v_issue);
end;
$$;

create or replace function public.gis_update_issue_noauth(
  p_rpc_secret text,
  p_actor_name text,
  p_issue_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.gis_issues%rowtype;
  v_updated public.gis_issues%rowtype;
  v_status text;
  v_next_type text;
  v_next_type_detail text;
  v_activity_type text := 'UPDATED';
  v_message text := 'แก้ไขรายละเอียด Issue';
  v_from_status text;
  v_to_status text;
begin
  perform public.assert_gis_noauth_rpc_secret(p_rpc_secret);
  p_actor_name := nullif(btrim(p_actor_name), '');
  if p_actor_name is null or length(p_actor_name) > 200 then
    raise check_violation using message = 'Invalid actor name';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise check_violation using message = 'Empty GIS issue patch';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_patch) key
    where key not in ('status', 'feeder_code', 'equipment_code', 'issue_type',
      'issue_type_detail', 'location_text', 'description', 'expected_value',
      'assignee_name', 'found_at', 'resolution_note', 'reference_url')
  ) then
    raise check_violation using message = 'Unsupported GIS issue field';
  end if;

  select * into v_current from public.gis_issues where id = p_issue_id for update;
  if not found then
    raise no_data_found using message = 'GIS issue not found';
  end if;

  if p_patch ? 'status' then
    v_status := p_patch->>'status';
    if not (
      (v_current.status = 'OPEN' and v_status = 'IN_PROGRESS')
      or (v_current.status = 'IN_PROGRESS' and v_status = 'VERIFYING')
      or (v_current.status = 'VERIFYING' and v_status = 'CLOSED')
      or (v_current.status <> 'OPEN' and v_status = 'OPEN')
    ) then
      raise check_violation using message = 'Invalid GIS issue status transition';
    end if;
    if v_status = 'VERIFYING' and nullif(btrim(p_patch->>'resolution_note'), '') is null then
      raise check_violation using message = 'Resolution note is required';
    end if;

    update public.gis_issues set
      status = v_status,
      assignee_name = case
        when v_status = 'IN_PROGRESS' and nullif(btrim(p_patch->>'assignee_name'), '') is not null
          then nullif(btrim(p_patch->>'assignee_name'), '')
        else assignee_name end,
      started_at = case when v_status = 'IN_PROGRESS' then now() when v_status = 'OPEN' then null else started_at end,
      resolved_at = case when v_status = 'VERIFYING' then now() when v_status = 'OPEN' then null else resolved_at end,
      verified_at = case when v_status = 'CLOSED' then now() when v_status = 'OPEN' then null else verified_at end,
      resolution_note = case
        when v_status = 'VERIFYING' then nullif(btrim(p_patch->>'resolution_note'), '')
        when v_status = 'OPEN' then null
        else resolution_note end
    where id = p_issue_id
    returning * into v_updated;

    v_activity_type := 'STATUS_CHANGED';
    v_from_status := v_current.status;
    v_to_status := v_status;
    v_message := case v_status
      when 'OPEN' then 'เปิด Issue กลับมาใหม่'
      when 'IN_PROGRESS' then 'เริ่มดำเนินการแก้ไข'
      when 'VERIFYING' then 'แก้ไข GIS แล้ว ส่งตรวจสอบ'
      when 'CLOSED' then 'ตรวจสอบแล้ว ปิด Issue'
    end;
  else
    v_next_type := case when p_patch ? 'issue_type' then p_patch->>'issue_type' else v_current.issue_type end;
    v_next_type_detail := case when p_patch ? 'issue_type_detail'
      then nullif(btrim(p_patch->>'issue_type_detail'), '') else v_current.issue_type_detail end;

    if v_next_type not in ('EQUIPMENT_POSITION', 'EQUIPMENT_CODE', 'LINE_ROUTE',
      'MISSING_FROM_GIS', 'MISSING_IN_GIS', 'CONNECTIVITY', 'EQUIPMENT_DETAILS', 'OTHER') then
      raise check_violation using message = 'Invalid issue type';
    end if;
    if v_next_type = 'OTHER' and v_next_type_detail is null then
      raise check_violation using message = 'Issue type detail is required';
    end if;
    if p_patch ? 'feeder_code' and nullif(btrim(p_patch->>'feeder_code'), '') is null then
      raise check_violation using message = 'Feeder code is required';
    end if;
    if p_patch ? 'description' and nullif(btrim(p_patch->>'description'), '') is null then
      raise check_violation using message = 'Description is required';
    end if;
    if p_patch ? 'found_at' and (p_patch->>'found_at') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise check_violation using message = 'Invalid found date';
    end if;
    if p_patch ? 'reference_url'
      and nullif(btrim(p_patch->>'reference_url'), '') is not null
      and (length(btrim(p_patch->>'reference_url')) > 2048 or (p_patch->>'reference_url') !~* '^https?://') then
      raise check_violation using message = 'Invalid reference URL';
    end if;

    update public.gis_issues set
      feeder_code = case when p_patch ? 'feeder_code' then upper(btrim(p_patch->>'feeder_code')) else feeder_code end,
      equipment_code = case when p_patch ? 'equipment_code' then nullif(upper(btrim(p_patch->>'equipment_code')), '') else equipment_code end,
      issue_type = v_next_type,
      issue_type_detail = v_next_type_detail,
      location_text = case when p_patch ? 'location_text' then nullif(btrim(p_patch->>'location_text'), '') else location_text end,
      description = case when p_patch ? 'description' then btrim(p_patch->>'description') else description end,
      expected_value = case when p_patch ? 'expected_value' then nullif(btrim(p_patch->>'expected_value'), '') else expected_value end,
      assignee_name = case when p_patch ? 'assignee_name' then nullif(btrim(p_patch->>'assignee_name'), '') else assignee_name end,
      found_at = case when p_patch ? 'found_at' then (p_patch->>'found_at')::date else found_at end,
      resolution_note = case when p_patch ? 'resolution_note' then nullif(btrim(p_patch->>'resolution_note'), '') else resolution_note end,
      reference_url = case when p_patch ? 'reference_url' then nullif(btrim(p_patch->>'reference_url'), '') else reference_url end
    where id = p_issue_id
    returning * into v_updated;
  end if;

  insert into public.gis_issue_activities (
    issue_id, activity_type, from_status, to_status, message, actor_id, actor_name
  ) values (
    p_issue_id, v_activity_type, v_from_status, v_to_status, v_message, null, p_actor_name
  );

  return to_jsonb(v_updated);
end;
$$;

create or replace function public.gis_job_counts_noauth(
  p_rpc_secret text,
  p_job_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb;
begin
  perform public.assert_gis_noauth_rpc_secret(p_rpc_secret);
  if coalesce(array_length(p_job_ids, 1), 0) > 200 then
    raise check_violation using message = 'Too many job IDs';
  end if;
  select coalesce(jsonb_object_agg(source_job_id, issue_count), '{}'::jsonb)
  into v_counts
  from (
    select source_job_id, count(*) as issue_count
    from public.gis_issues
    where source_job_id = any(p_job_ids)
    group by source_job_id
  ) counts;
  return v_counts;
end;
$$;

revoke all on function public.gis_list_issues_noauth(text, text, text, text, text, uuid) from public;
revoke all on function public.gis_get_issue_noauth(text, uuid) from public;
revoke all on function public.gis_create_issue_noauth(text, text, text, text, text, text, text, text, text, text, date, text, uuid) from public;
revoke all on function public.gis_update_issue_noauth(text, text, uuid, jsonb) from public;
revoke all on function public.gis_job_counts_noauth(text, uuid[]) from public;

grant execute on function public.gis_list_issues_noauth(text, text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.gis_get_issue_noauth(text, uuid) to anon, authenticated;
grant execute on function public.gis_create_issue_noauth(text, text, text, text, text, text, text, text, text, text, date, text, uuid) to anon, authenticated;
grant execute on function public.gis_update_issue_noauth(text, text, uuid, jsonb) to anon, authenticated;
grant execute on function public.gis_job_counts_noauth(text, uuid[]) to anon, authenticated;
