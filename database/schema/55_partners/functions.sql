-- 55_partners functions (plan §4 partners, §6; 2026-11-27).

-- Service-role only (partner-apply Edge Function). The function creates the Auth user with the
-- Auth Admin API first (app_metadata.account_type = staff), then calls this for the database side.
-- p_application: {business_name, contact_name (required); category, address, phone, website_url,
-- message}. Creates an inactive partner business, the applicant's staff row and a pending
-- application. No role is granted until the owner approves.
create or replace function api.svc_partner_register(p_user_id uuid, p_application jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad text;
  v_contact text;
  v_biz public.businesses;
  v_app public.partner_applications;
begin
  if p_application is null or jsonb_typeof(p_application) <> 'object' then
    perform private.raise_error('VALIDATION_FAILED', 'application');
  end if;
  select k into v_bad from jsonb_object_keys(p_application) k
  where k not in ('business_name', 'contact_name', 'category', 'address', 'phone', 'website_url', 'message')
     or jsonb_typeof(p_application -> k) not in ('string', 'null')
  limit 1;
  if v_bad is not null then
    perform private.raise_error('VALIDATION_FAILED', 'field: ' || v_bad);
  end if;
  v_contact := nullif(btrim(p_application ->> 'contact_name'), '');
  if v_contact is null then
    perform private.raise_error('VALIDATION_FAILED', 'contact_name');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform private.raise_error('NOT_FOUND', 'user');
  end if;

  v_biz := private.create_business_row(jsonb_build_object(
      'name', p_application ->> 'business_name',
      'category', p_application ->> 'category',
      'address', p_application ->> 'address',
      'phone', p_application ->> 'phone',
      'website_url', p_application ->> 'website_url'),
    'partner', false);
  perform private.create_partner_staff(p_user_id, v_biz.id, v_contact);

  begin
    insert into public.partner_applications (business_id, applicant_id, message)
    values (v_biz.id, p_user_id, nullif(btrim(p_application ->> 'message'), ''))
    returning * into v_app;
  exception
    when check_violation then
      perform private.raise_error('VALIDATION_FAILED', 'message');
    when unique_violation then
      perform private.raise_error('CONFLICT', 'already applied');
  end;

  perform audit.write_as(p_user_id, 'partner.applied', 'partner_application', v_biz.id, null,
    to_jsonb(v_app), v_biz.id);
  return jsonb_build_object('business_id', v_biz.id, 'status', v_app.status);
end;
$$;

-- Owner dashboard: applications with business and applicant details, newest first.
create or replace function api.list_partner_applications(p_status public.partner_status default null)
returns table (business_id uuid, business_name text, category text, address text, business_phone text,
               website_url text, logo_path text, is_active boolean, applicant_id uuid, contact_name text,
               applicant_phone text, status public.partner_status, message text, decided_at timestamptz,
               decision_note text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('partner.manage', null);
  return query
    select a.business_id, b.name, b.category, b.address, b.phone, b.website_url, b.logo_path, b.is_active,
           a.applicant_id, s.display_name, p.phone_e164, a.status, a.message, a.decided_at, a.decision_note,
           a.created_at
    from public.partner_applications a
    join public.businesses b on b.id = a.business_id
    join public.profiles p on p.id = a.applicant_id
    left join public.staff s on s.user_id = a.applicant_id
    where p_status is null or a.status = p_status
    order by a.created_at desc, a.business_id;
end;
$$;

-- Owner approves or rejects. Approve (from pending, rejected or revoked): grant role 'partner' for
-- that business and activate it. Reject (from pending only): the business stays inactive.
create or replace function api.decide_partner(p_business_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_permission('partner.manage', null);
  v_a public.partner_applications;
  v_new public.partner_status;
begin
  if p_business_id is null or p_approve is null then
    perform private.raise_error('VALIDATION_FAILED', 'business_id and approve required');
  end if;
  if char_length(p_note) > 500 then
    perform private.raise_error('VALIDATION_FAILED', 'note');
  end if;
  select * into v_a from public.partner_applications where business_id = p_business_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'partner_application');
  end if;

  if p_approve then
    if v_a.status = 'approved' then
      perform private.raise_error('CONFLICT', 'already approved');
    end if;
    v_new := 'approved';
    perform private.grant_role(v_a.applicant_id, 'partner', v_a.business_id, v_uid);
    perform private.set_business_active(v_a.business_id, true);
  else
    if v_a.status <> 'pending' then
      perform private.raise_error('CONFLICT', 'only pending applications can be rejected');
    end if;
    v_new := 'rejected';
  end if;

  update public.partner_applications
  set status = v_new, decided_by = v_uid, decided_at = now(), decision_note = nullif(btrim(p_note), '')
  where business_id = v_a.business_id;
  perform audit.write(case when p_approve then 'partner.approved' else 'partner.rejected' end,
    'partner_application', v_a.business_id, jsonb_build_object('status', v_a.status),
    jsonb_build_object('status', v_new, 'note', nullif(btrim(p_note), '')), v_a.business_id);
  return jsonb_build_object('business_id', v_a.business_id, 'status', v_new);
end;
$$;

-- Owner revokes an approved partner: role removed, business deactivated, active offers paused.
create or replace function api.revoke_partner(p_business_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_permission('partner.manage', null);
  v_a public.partner_applications;
  v_paused integer;
begin
  if p_business_id is null then
    perform private.raise_error('VALIDATION_FAILED', 'business_id required');
  end if;
  if char_length(p_note) > 500 then
    perform private.raise_error('VALIDATION_FAILED', 'note');
  end if;
  select * into v_a from public.partner_applications where business_id = p_business_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'partner_application');
  end if;
  if v_a.status <> 'approved' then
    perform private.raise_error('CONFLICT', 'only approved partners can be revoked');
  end if;

  perform private.revoke_roles(v_a.applicant_id, 'partner');
  perform private.set_business_active(v_a.business_id, false);
  v_paused := private.pause_business_offers(v_a.business_id);

  update public.partner_applications
  set status = 'revoked', decided_by = v_uid, decided_at = now(), decision_note = nullif(btrim(p_note), '')
  where business_id = v_a.business_id;
  perform audit.write('partner.revoked', 'partner_application', v_a.business_id,
    jsonb_build_object('status', v_a.status),
    jsonb_build_object('status', 'revoked', 'note', nullif(btrim(p_note), ''), 'offers_paused', v_paused),
    v_a.business_id);
  return jsonb_build_object('business_id', v_a.business_id, 'status', 'revoked', 'offers_paused', v_paused);
end;
$$;

-- For 30_staff api.get_my_staff: {partner_status, decision_note} of a partner business.
create or replace function private.partner_brief(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('partner_status', a.status, 'decision_note', a.decision_note)
     from public.partner_applications a where a.business_id = p_business_id),
    jsonb_build_object('partner_status', null, 'decision_note', null));
$$;
