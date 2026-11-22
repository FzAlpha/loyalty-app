-- 90_accounts functions: account deletion (BACKEND_PLAN.md §5, §9, §12).
-- Uses other modules only through their functions: 10_identity (anonymise, customer checks),
-- 40_cards (block the card), 60_claims (revoke claims), 85_security (recovery codes, lockout),
-- 80_audit. plpgsql so those functions are resolved at call time.

-- Starts the deletion of one customer-only account. In one transaction: the profile and auth
-- user are anonymised, the phone is freed, sessions end, the card is blocked (never reused),
-- open claims and recovery codes are revoked. Redemptions keep the (now anonymous) customer id.
-- Returns the request id. Idempotent: an existing request is returned unchanged.
create or replace function private.begin_account_deletion(
  p_user_id uuid,
  p_reason public.deletion_reason,
  p_actor uuid,
  p_process_after timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_status public.account_status;
  v_card uuid;
  v_id uuid;
begin
  select phone_e164, account_status into v_phone, v_status from public.profiles where id = p_user_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'account');
  end if;
  select id into v_id from public.deletion_requests where user_id = p_user_id;
  if v_id is not null then
    return v_id;
  end if;
  if not private.is_customer_only(p_user_id) then
    perform private.raise_error('FORBIDDEN', 'only customer accounts can be deleted here');
  end if;

  perform private.anonymise_profile(p_user_id, 'deletion_pending');
  v_card := private.block_customer_card(p_user_id, 'account deleted');
  perform private.revoke_customer_claims(p_user_id);
  perform private.revoke_user_recovery_codes(p_user_id);
  if v_phone is not null then
    perform private.forget_login_attempts(v_phone);
  end if;

  insert into public.deletion_requests (user_id, reason, requested_by, process_after)
  values (p_user_id, p_reason, p_actor, p_process_after)
  returning id into v_id;
  perform audit.write_as(p_actor, 'account.deletion_requested', 'profile', p_user_id,
    jsonb_build_object('account_status', v_status),
    jsonb_build_object('reason', p_reason, 'request_id', v_id, 'card_id', v_card, 'process_after', p_process_after));
  return v_id;
end;
$$;

-- Customer asks to delete their own account (plan §5). The account is anonymised at once; the
-- auth user is removed after retention.deleted_account_days by the process_deletions job.
create or replace function api.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_status public.account_status;
  v_after timestamptz;
  v_id uuid;
begin
  if not private.session_is_live() then
    perform private.raise_error('UNAUTHENTICATED');
  end if;
  if exists (select 1 from public.deletion_requests where user_id = v_uid) then
    perform private.raise_error('ACCOUNT_DELETION_PENDING');
  end if;
  select account_status into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'active' then
    perform private.raise_error('ACCOUNT_INACTIVE');
  end if;
  if not private.is_customer_only(v_uid) then
    perform private.raise_error('FORBIDDEN', 'staff accounts are removed through staff-admin');
  end if;
  v_after := now() + make_interval(days => (private.get_setting('retention.deleted_account_days'))::integer);
  v_id := private.begin_account_deletion(v_uid, 'customer_request', v_uid, v_after);
  return jsonb_build_object('request_id', v_id, 'status', 'requested', 'process_after', v_after);
end;
$$;

-- purge_unchecked_accounts job (§9): accounts with no passed identity check older than
-- retention.unchecked_accounts_days, or disabled by a phone release, are anonymised now and
-- queued for immediate Auth removal (the retention period has already passed).
create or replace function private.purge_unchecked_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => (private.get_setting('retention.unchecked_accounts_days'))::integer);
  v_uid uuid;
  v_count integer := 0;
begin
  for v_uid in
    select u from private.unchecked_customer_ids(v_cutoff) u
    where not exists (select 1 from public.deletion_requests d where d.user_id = u)
  loop
    perform private.begin_account_deletion(v_uid, 'unchecked_account', null, now());
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.deletion_due_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.deletion_requests
  where status in ('requested', 'failed') and process_after <= now();
$$;

-- jobs-runner (service role): takes up to p_limit due requests and marks them processing.
-- skip locked lets overlapping runs share the work without taking the same row.
create or replace function api.svc_claim_due_deletions(p_limit integer)
returns table (request_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_limit is null or p_limit < 1 then
    perform private.raise_error('VALIDATION_FAILED', 'limit');
  end if;
  return query
    with due as (
      select d.id from public.deletion_requests d
      where d.status in ('requested', 'failed') and d.process_after <= now()
      order by d.process_after
      limit p_limit
      for update skip locked)
    update public.deletion_requests r
    set status = 'processing', attempts = r.attempts + 1, error = null
    from due where r.id = due.id
    returning r.id, r.user_id;
end;
$$;

-- jobs-runner (service role): records the Auth Admin result. p_error null = the auth user was
-- removed, so the account is final ('deleted'). A failed request is retried by the next run.
create or replace function api.svc_complete_deletion(p_request_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.deletion_requests;
begin
  select * into v_req from public.deletion_requests where id = p_request_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'deletion request');
  end if;
  if v_req.status <> 'processing' then
    perform private.raise_error('CONFLICT', 'request is not processing');
  end if;
  if p_error is null then
    update public.deletion_requests set status = 'completed', completed_at = now() where id = p_request_id;
    update public.profiles set account_status = 'deleted' where id = v_req.user_id;
    perform audit.write_as(null, 'account.deleted', 'profile', v_req.user_id, null,
      jsonb_build_object('request_id', p_request_id, 'attempts', v_req.attempts));
  else
    update public.deletion_requests set status = 'failed', error = left(p_error, 1000) where id = p_request_id;
    perform audit.write_as(null, 'account.deletion_failed', 'profile', v_req.user_id, null,
      jsonb_build_object('request_id', p_request_id, 'attempts', v_req.attempts, 'error', left(p_error, 1000)));
  end if;
end;
$$;
