-- 30_staff functions. Called by private.user_can (10_identity) and by the staff-admin Edge Function.

-- Non-staff users pass. Staff must be active and, when business-scoped, act for their own business.
create or replace function private.staff_allows(p_uid uuid, p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.is_active and (s.business_id is null or s.business_id = p_business_id)
     from public.staff s where s.user_id = p_uid),
    true);
$$;

-- Staff accounts (active or not) cannot act as customers (e.g. link a card, 40_cards).
create or replace function private.is_staff(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = p_uid);
$$;

-- Service-role only (staff-admin). The Edge Function creates/updates the auth user with the
-- Auth Admin API first, then calls this for the database side. p_actor_id comes from the
-- caller's verified JWT and is re-checked here.
create or replace function api.svc_staff_upsert(
  p_actor_id uuid,
  p_user_id uuid,
  p_role_key text,
  p_business_id uuid,
  p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  if not private.user_can(p_actor_id, 'staff.manage', null) then
    perform private.raise_error('FORBIDDEN', 'staff.manage');
  end if;
  if p_role_key not in ('executive', 'owner') then
    perform private.raise_error('VALIDATION_FAILED', 'role');
  end if;
  if (p_role_key = 'executive') <> (p_business_id is not null) then
    perform private.raise_error('VALIDATION_FAILED', 'executive needs a business; owner must not have one');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform private.raise_error('NOT_FOUND', 'user');
  end if;

  select to_jsonb(s) into v_before from public.staff s where s.user_id = p_user_id for update;
  insert into public.staff (user_id, business_id, display_name)
  values (p_user_id, p_business_id, p_display_name)
  on conflict (user_id) do update
    set business_id = excluded.business_id, display_name = excluded.display_name;

  -- One staff role at a time: reassigning replaces the previous grant.
  perform private.revoke_roles(p_user_id, 'executive');
  perform private.revoke_roles(p_user_id, 'owner');
  -- Staff are never customers. The signup trigger may already have granted 'customer': Auth Admin
  -- createUser inserts the row before app_metadata.account_type is visible to the trigger.
  perform private.revoke_roles(p_user_id, 'customer');
  perform private.grant_role(p_user_id, p_role_key, p_business_id, p_actor_id);

  perform audit.write_as(p_actor_id, 'staff.upsert', 'staff', p_user_id, v_before,
    jsonb_build_object('role', p_role_key, 'business_id', p_business_id, 'display_name', p_display_name),
    p_business_id);
end;
$$;

-- Service-role only (staff-admin). Enable/disable; the Edge Function also bans the auth user
-- and revokes sessions when disabling (§7.5).
create or replace function api.svc_staff_set_active(p_actor_id uuid, p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.staff%rowtype;
begin
  if not private.user_can(p_actor_id, 'staff.manage', null) then
    perform private.raise_error('FORBIDDEN', 'staff.manage');
  end if;
  if p_actor_id = p_user_id then
    perform private.raise_error('VALIDATION_FAILED', 'cannot change own staff status');
  end if;
  select * into v_row from public.staff where user_id = p_user_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'staff');
  end if;
  update public.staff
  set is_active = p_active,
      disabled_at = case when p_active then null else now() end,
      disabled_by = case when p_active then null else p_actor_id end
  where user_id = p_user_id;
  perform audit.write_as(p_actor_id, case when p_active then 'staff.enable' else 'staff.disable' end,
    'staff', p_user_id, jsonb_build_object('is_active', v_row.is_active), jsonb_build_object('is_active', p_active),
    v_row.business_id);
end;
$$;

-- Service-role only (staff-admin): after an owner resets a staff password.
create or replace function api.svc_staff_mark_password_reset(p_actor_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.user_can(p_actor_id, 'staff.manage', null) then
    perform private.raise_error('FORBIDDEN', 'staff.manage');
  end if;
  update public.staff set must_change_password = true where user_id = p_user_id;
  if not found then
    perform private.raise_error('NOT_FOUND', 'staff');
  end if;
  perform audit.write_as(p_actor_id, 'staff.password_reset', 'staff', p_user_id, null, null, null);
end;
$$;

-- Signed-in staff member, after changing their own password with Supabase Auth.
create or replace function api.staff_password_changed()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
begin
  update public.staff set must_change_password = false where user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------- admin app (F2, plan §6)
-- Signed-in staff member's own context, for routing the admin app only. Role comes from the staff
-- row's scope (business_id null = owner, set by staff_upsert); every RPC still checks permissions.
create or replace function api.get_my_staff()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_s public.staff;
begin
  if not private.session_is_live() then
    perform private.raise_error('FORBIDDEN', 'staff.view');
  end if;
  select * into v_s from public.staff where user_id = v_uid;
  if not found then
    perform private.raise_error('NOT_FOUND', 'staff');
  end if;
  return jsonb_build_object(
    'user_id', v_s.user_id,
    'display_name', v_s.display_name,
    'role', case when v_s.business_id is null then 'owner' else 'executive' end,
    'business_id', v_s.business_id,
    'business_name', private.business_name(v_s.business_id),
    'is_active', v_s.is_active,
    'must_change_password', v_s.must_change_password);
end;
$$;
