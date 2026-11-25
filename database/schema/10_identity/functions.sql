-- 10_identity functions: authz (§5), signup trigger (§7.1), SMS refusal hook (§7.1),
-- identity checks (§7.4), phone release (§7.4).

-- ---------------------------------------------------------------- authorization

-- True when the caller's JWT session still exists. Lets server-side session revocation
-- (deleting auth.sessions rows) take effect at once for every RPC, not only at token refresh.
-- JWTs issued by Supabase Auth always carry session_id; a token without one is not trusted.
create or replace function private.session_is_live()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sid text := auth.jwt() ->> 'session_id';
begin
  if v_sid is null then
    return false;
  end if;
  return exists (select 1 from auth.sessions s where s.id = v_sid::uuid and s.user_id = auth.uid());
exception when invalid_text_representation then
  return false;
end;
$$;

-- Core check for a given user (live tables, §5). p_business_id null = the permission must be
-- granted for all businesses (owner scope). Used directly only by service-role RPCs, which pass
-- an actor id the Edge Function took from a verified JWT.
create or replace function private.user_can(p_uid uuid, p_permission text, p_business_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_uid is null then
    return false;
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_uid and p.account_status = 'active') then
    return false;
  end if;
  if not private.staff_allows(p_uid, p_business_id) then -- 30_staff: disabled staff fail at once
    return false;
  end if;
  return exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions pm on pm.id = rp.permission_id
    where ur.user_id = p_uid
      and ur.is_active
      and pm.key = p_permission
      and (ur.business_id is null or ur.business_id = p_business_id)
  );
end;
$$;

-- Same check for the caller of this request, plus a live-session check.
create or replace function private.can(p_permission text, p_business_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.session_is_live() and private.user_can(auth.uid(), p_permission, p_business_id);
$$;

-- Permission held for at least one business (or globally). For data that is not business-owned.
create or replace function private.can_any(p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.session_is_live() then
    return false;
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.account_status = 'active') then
    return false;
  end if;
  return exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions pm on pm.id = rp.permission_id
    where ur.user_id = v_uid
      and ur.is_active
      and pm.key = p_permission
      and private.staff_allows(v_uid, ur.business_id)
  );
end;
$$;

create or replace function private.require_permission(p_permission text, p_business_id uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
begin
  if not private.can(p_permission, p_business_id) then
    perform private.raise_error('FORBIDDEN', p_permission);
  end if;
  return v_uid;
end;
$$;

-- Exposed check used by Edge Functions (with the caller's JWT) and by the apps for UI gating.
create or replace function api.has_permission(p_permission text, p_business_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can(p_permission, p_business_id);
$$;

create or replace function api.has_any_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_any(p_permission);
$$;

-- ---------------------------------------------------------------- roles (used by other modules)

create or replace function private.grant_role(p_user_id uuid, p_role_key text, p_business_id uuid, p_granted_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
begin
  select id into v_role from public.roles where key = p_role_key;
  if v_role is null then
    perform private.raise_error('NOT_FOUND', 'role ' || p_role_key);
  end if;
  insert into public.user_roles (user_id, role_id, business_id, granted_by)
  values (p_user_id, v_role, p_business_id, p_granted_by)
  on conflict (user_id, role_id, coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set is_active = true, granted_by = excluded.granted_by, granted_at = now();
end;
$$;

create or replace function private.revoke_roles(p_user_id uuid, p_role_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.user_roles ur set is_active = false
  from public.roles r
  where r.id = ur.role_id and r.key = p_role_key and ur.user_id = p_user_id and ur.is_active;
$$;

-- ---------------------------------------------------------------- signup (§7.1)

-- Runs for every new auth user. Customers come only from auth-register (Admin createUser).
-- Staff accounts are created by staff-admin with app_metadata.account_type = 'staff'
-- (app_metadata is writable only with the service role), so they get no customer role.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone_e164, date_of_birth)
  values (
    new.id,
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 200), ''),
    case when nullif(new.phone, '') is null then null else '+' || ltrim(new.phone, '+') end,
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date
  );
  if coalesce(new.raw_app_meta_data ->> 'account_type', 'customer') <> 'staff' then
    perform private.grant_role(new.id, 'customer', null, null);
  end if;
  return new;
end;
$$;

-- Keeps profiles.phone_e164 in step when Supabase Auth changes the phone.
create or replace function private.sync_auth_user_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Accounts being deleted are already anonymised; Auth's soft delete rewrites the phone with a
  -- placeholder that is not a phone number, so it must not reach the profile.
  update public.profiles
  set phone_e164 = case when nullif(new.phone, '') is null then null else '+' || ltrim(new.phone, '+') end
  where id = new.id and account_status not in ('deletion_pending', 'deleted');
  return new;
end;
$$;

-- Send SMS Hook: refuses every SMS. No provider, nothing is sent (§7.1, decided after M0).
create or replace function private.auth_send_sms_hook(event jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'SMS is disabled for this project'));
$$;

-- ---------------------------------------------------------------- identity checks (§7.4)

-- Internal: also called by card approval (M4) and in-store recovery (85_security).
create or replace function private.record_identity_check(
  p_customer_id uuid,
  p_business_id uuid,
  p_evidence public.identity_evidence[],
  p_result public.identity_check_result,
  p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec uuid := private.require_permission('customer.identity_check', p_business_id);
  v_id uuid;
begin
  if p_business_id is null then
    perform private.raise_error('VALIDATION_FAILED', 'business_id required');
  end if;
  if p_customer_id = v_exec then
    perform private.raise_error('VALIDATION_FAILED', 'cannot check own identity');
  end if;
  if not exists (select 1 from public.profiles where id = p_customer_id) then
    perform private.raise_error('NOT_FOUND', 'customer');
  end if;
  insert into public.identity_checks (customer_id, executive_id, business_id, evidence, result, note)
  values (p_customer_id, v_exec, p_business_id, p_evidence, p_result, nullif(btrim(p_note), ''))
  returning id into v_id;
  if p_result = 'passed' then
    update public.profiles set identity_checked_at = now() where id = p_customer_id;
  end if;
  return v_id;
end;
$$;

create or replace function api.record_identity_check(
  p_customer_id uuid,
  p_business_id uuid,
  p_evidence public.identity_evidence[],
  p_result public.identity_check_result,
  p_note text default null)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.record_identity_check(p_customer_id, p_business_id, p_evidence, p_result, p_note);
$$;

create or replace function private.has_passed_identity_check(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.identity_checks where customer_id = p_customer_id and result = 'passed');
$$;

-- ---------------------------------------------------------------- phone release (§7.4)

-- Allowed only when the holder has no passed identity check, no active membership and no
-- pending/active card. plpgsql so the 40_cards function is resolved at call time.
create or replace function private.phone_release_allowed(p_holder uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return not private.has_passed_identity_check(p_holder)
     and exists (select 1 from public.profiles where id = p_holder and membership_status <> 'active')
     and not private.customer_has_live_card(p_holder);
end;
$$;

-- ---------------------------------------------------------------- membership (used by 40_cards)
create or replace function private.set_membership_status(p_customer_id uuid, p_status public.membership_status)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set membership_status = p_status where id = p_customer_id;
$$;

-- Masked customer view for staff screens (40_cards scan): name, last 4 phone digits, check state.
create or replace function private.customer_masked(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('customer_id', p.id, 'full_name', p.full_name,
           'phone_masked', case when p.phone_e164 is null then null else '******' || right(p.phone_e164, 4) end,
           'identity_checked_at', p.identity_checked_at, 'membership_status', p.membership_status)
  from public.profiles p where p.id = p_customer_id;
$$;

-- Active customer account (not staff) whose membership allows linking a card.
create or replace function private.customer_can_link(p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (select 1 from public.profiles
                 where id = p_uid and account_status = 'active' and membership_status in ('none', 'rejected'))
     and not private.is_staff(p_uid);
end;
$$;

create or replace function api.request_phone_release(p_phone_e164 text, p_business_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec uuid := private.require_permission('customer.release_phone.request', p_business_id);
  v_holder uuid;
  v_id uuid;
begin
  if p_business_id is null or nullif(btrim(p_reason), '') is null then
    perform private.raise_error('VALIDATION_FAILED', 'business_id and reason required');
  end if;
  select id into v_holder from public.profiles where phone_e164 = p_phone_e164;
  if v_holder is null then
    perform private.raise_error('NOT_FOUND', 'phone');
  end if;
  if not private.phone_release_allowed(v_holder) then
    perform private.raise_error('RELEASE_NOT_ALLOWED');
  end if;
  insert into public.phone_release_requests (phone_e164, holder_customer_id, requested_by, requested_business_id, reason)
  values (p_phone_e164, v_holder, v_exec, p_business_id, btrim(p_reason))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  perform private.raise_error('CONFLICT', 'a release request is already pending');
  return null;
end;
$$;

-- Approve: the holder account is disabled and its profile phone cleared. Freeing the number in
-- auth.users is done by the account-deletion path (Auth Admin API), see plan §7.4 / §17.3.
-- Frees a released phone in Supabase Auth so the real holder can register it (§7.5). Runs inside
-- decide_phone_release so the decision and the Auth change commit together. Writes auth.* directly,
-- like session revocation; verified against GoTrue by backend/tests/auth_phone_release.sh.
-- banned_until is a finite date: GoTrue cannot read 'infinity'.
create or replace function private.release_auth_phone(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set phone = null, phone_confirmed_at = null, banned_until = now() + interval '100 years'
  where id = p_user_id;
  delete from auth.identities where user_id = p_user_id and provider = 'phone';
  perform private.revoke_user_sessions(p_user_id);
end;
$$;

create or replace function api.decide_phone_release(p_request_id uuid, p_approve boolean, p_note text default null)
returns public.phone_release_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := private.require_permission('customer.release_phone.approve', null);
  v_req public.phone_release_requests%rowtype;
  v_status public.phone_release_status;
begin
  select * into v_req from public.phone_release_requests where id = p_request_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'release request');
  end if;
  if v_req.status <> 'pending' then
    perform private.raise_error('CONFLICT', 'request already decided');
  end if;
  if v_req.requested_by = v_owner then
    perform private.raise_error('SAME_APPROVER');
  end if;
  perform 1 from public.profiles where id = v_req.holder_customer_id for update;
  if p_approve and not private.phone_release_allowed(v_req.holder_customer_id) then
    perform private.raise_error('RELEASE_NOT_ALLOWED');
  end if;
  v_status := case when p_approve then 'approved' else 'rejected' end;
  update public.phone_release_requests
  set status = v_status, decided_by = v_owner, decided_at = now(), decision_note = nullif(btrim(p_note), '')
  where id = p_request_id;
  if p_approve then
    update public.profiles set account_status = 'disabled', phone_e164 = null where id = v_req.holder_customer_id;
    perform private.release_auth_phone(v_req.holder_customer_id);
  end if;
  return v_status;
end;
$$;

-- Facts the eligibility engine (50_offers) needs about a customer. No row = unknown customer.
create or replace function private.customer_offer_facts(p_customer_id uuid)
returns table (account_status public.account_status, membership_status public.membership_status, date_of_birth date)
language sql
stable
security definer
set search_path = ''
as $$
  select p.account_status, p.membership_status, p.date_of_birth from public.profiles p where p.id = p_customer_id;
$$;

-- ---------------------------------------------------------------- account deletion (used by 90_accounts)

-- Removes personal data from the profile and the auth user, frees the phone in Auth and ends
-- every session. The ids stay so redemptions keep their (now anonymous) customer reference.
create or replace function private.anonymise_profile(p_user_id uuid, p_status public.account_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set full_name = '', phone_e164 = null, date_of_birth = null, account_status = p_status
  where id = p_user_id;
  update auth.users set raw_user_meta_data = '{}'::jsonb where id = p_user_id;
  perform private.release_auth_phone(p_user_id);
end;
$$;

-- Holds an active customer role and nothing else, and is not staff. Only such accounts can be
-- deleted by these paths; staff are disabled through staff-admin instead.
create or replace function private.is_customer_only(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                 where ur.user_id = p_user_id and ur.is_active and r.key = 'customer')
     and not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                     where ur.user_id = p_user_id and ur.is_active and r.key <> 'customer')
     and not private.is_staff(p_user_id);
end;
$$;

-- Customer-only accounts that never passed an identity check and either registered before
-- p_cutoff or were disabled by an approved phone release (the only path that disables a
-- customer, §7.4; that holder then follows the deletion path at once).
create or replace function private.unchecked_customer_ids(p_cutoff timestamptz)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select p.id from public.profiles p
    where ((p.account_status = 'active' and p.created_at < p_cutoff) or p.account_status = 'disabled')
      and not private.has_passed_identity_check(p.id)
      and private.is_customer_only(p.id);
end;
$$;

-- ---------------------------------------------------------------- customer reads (F1, plan §6)
-- Caller's own account. auth.uid() only; card via 40_cards private.customer_card_summary.
create or replace function api.get_my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_p public.profiles;
begin
  if not private.session_is_live() then
    perform private.raise_error('FORBIDDEN', 'account.view');
  end if;
  select * into v_p from public.profiles where id = v_uid;
  if not found then
    perform private.raise_error('NOT_FOUND', 'profile');
  end if;
  return jsonb_build_object(
    'full_name', v_p.full_name,
    'phone_e164', v_p.phone_e164,
    'date_of_birth', v_p.date_of_birth,
    'membership_status', v_p.membership_status,
    'account_status', v_p.account_status,
    'identity_checked_at', v_p.identity_checked_at,
    'member_since', v_p.created_at,
    'card', private.customer_card_summary(v_uid));
end;
$$;
