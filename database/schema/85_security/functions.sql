-- 85_security functions. svc_* functions are for Edge Functions using the service role only.

-- Token bucket. Setting ratelimit.<action> = {"capacity": n, "per_seconds": s}. A missing setting
-- raises SETTING_NOT_FOUND (fail closed, no silent default). A rejected call raises, which rolls
-- back its own bucket update, so it does not spend a token.
create or replace function private.consume_rate_limit(p_action text, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := private.get_setting('ratelimit.' || p_action);
  v_capacity numeric := (v_cfg ->> 'capacity')::numeric;
  v_rate numeric := (v_cfg ->> 'capacity')::numeric / (v_cfg ->> 'per_seconds')::numeric;
  v_bucket text := p_action || ':' || coalesce(p_key, '');
  v_tokens numeric;
begin
  insert into ops.rate_limit_buckets as b (bucket_key, tokens, updated_at)
  values (v_bucket, v_capacity - 1, now())
  on conflict (bucket_key) do update
    set tokens = least(v_capacity, b.tokens + extract(epoch from (now() - b.updated_at)) * v_rate) - 1,
        updated_at = now()
  returning tokens into v_tokens;
  if v_tokens < 0 then
    perform private.raise_error('RATE_LIMITED', p_action);
  end if;
end;
$$;

create or replace function api.svc_rate_limit(p_action text, p_key text)
returns void
language sql
security definer
set search_path = ''
as $$ select private.consume_rate_limit(p_action, p_key); $$;

-- Deletes every session (refresh tokens follow by FK cascade). Supabase still accepts already
-- issued access JWTs until they expire, but private.can() rejects them because the session row
-- is gone.
create or replace function private.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function api.svc_revoke_user_sessions(p_actor_id uuid, p_user_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := private.revoke_user_sessions(p_user_id);
begin
  perform audit.write_as(p_actor_id, 'auth.sessions_revoked', 'profile', p_user_id, null,
    jsonb_build_object('sessions', v_count, 'reason', p_reason), null);
  return v_count;
end;
$$;

-- Lockout (§7.2). Best effort: direct calls to Supabase Auth bypass it (documented limitation).
create or replace function api.svc_login_guard(p_phone_e164 text)
returns timestamptz -- locked_until while locked, else null
language sql
stable
security definer
set search_path = ''
as $$
  select la.locked_until from ops.login_attempts la
  where la.phone_e164 = p_phone_e164 and la.locked_until > now();
$$;

create or replace function api.svc_login_result(p_phone_e164 text, p_success boolean, p_ip inet)
returns timestamptz -- locked_until after this failure, else null
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer := (private.get_setting('auth.lockout.max_failures'))::integer;
  v_window integer := (private.get_setting('auth.lockout.window_seconds'))::integer;
  v_lock integer := (private.get_setting('auth.lockout.lock_seconds'))::integer;
  v_row ops.login_attempts%rowtype;
  v_restart boolean;
begin
  if p_success then
    delete from ops.login_attempts where phone_e164 = p_phone_e164;
    return null;
  end if;

  select * into v_row from ops.login_attempts where phone_e164 = p_phone_e164 for update;
  if not found then
    insert into ops.login_attempts (phone_e164, failures, first_failure_at, last_ip)
    values (p_phone_e164, 0, now(), p_ip)
    on conflict (phone_e164) do nothing;
    select * into v_row from ops.login_attempts where phone_e164 = p_phone_e164 for update;
  end if;

  v_restart := v_row.failures = 0
    or v_row.first_failure_at < now() - make_interval(secs => v_window)
    or (v_row.locked_until is not null and v_row.locked_until <= now());

  update ops.login_attempts
  set failures = case when v_restart then 1 else failures + 1 end,
      first_failure_at = case when v_restart then now() else first_failure_at end,
      locked_until = case
        when (case when v_restart then 1 else failures + 1 end) >= v_max
          then now() + make_interval(secs => v_lock)
        when v_restart then null
        else locked_until end,
      last_ip = p_ip,
      updated_at = now()
  where phone_e164 = p_phone_e164
  returning * into v_row;
  return v_row.locked_until;
end;
$$;

create or replace function private.recovery_code_hash(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(sha256(convert_to(upper(p_code), 'UTF8')), 'hex'); $$;

-- 32-symbol alphabet (no 0/O/1/I); 256 % 32 = 0 so each byte maps without bias.
create or replace function private.random_recovery_code(p_length integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(p_length);
  v_out text := '';
begin
  for i in 0 .. p_length - 1 loop
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_out;
end;
$$;

-- Staff/owner (§7.3). in_store: customer.recover for p_business_id plus a passed identity check
-- recorded in this call. owner_remote: customer.recover_remote (global), reason, daily cap
-- (rolling 24 hours). Returns the plain code once; only its hash is stored.
create or replace function api.issue_recovery_code(
  p_customer_id uuid,
  p_channel public.recovery_channel,
  p_business_id uuid default null,
  p_reason text default null,
  p_evidence public.identity_evidence[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_ttl integer;
  v_code text;
  v_id uuid;
  v_expires timestamptz;
  v_issued integer;
begin
  if p_channel = 'in_store' then
    if p_business_id is null then
      perform private.raise_error('VALIDATION_FAILED', 'business_id');
    end if;
    v_uid := private.require_permission('customer.recover', p_business_id);
    if coalesce(cardinality(p_evidence), 0) = 0 then
      perform private.raise_error('VALIDATION_FAILED', 'evidence');
    end if;
    v_ttl := (private.get_setting('auth.recovery.code_ttl_seconds', p_business_id))::integer;
  else
    v_uid := private.require_permission('customer.recover_remote', null);
    if p_reason is null or char_length(trim(p_reason)) = 0 then
      perform private.raise_error('VALIDATION_FAILED', 'reason');
    end if;
    select count(*) into v_issued from ops.recovery_codes
    where issued_by = v_uid and channel = 'owner_remote' and created_at > now() - interval '24 hours';
    if v_issued >= (private.get_setting('auth.recovery.remote_daily_limit_per_owner'))::integer then
      perform private.raise_error('REMOTE_LIMIT_REACHED');
    end if;
    v_ttl := (private.get_setting('auth.recovery.remote_code_ttl_seconds'))::integer;
  end if;

  if p_customer_id = v_uid then
    perform private.raise_error('VALIDATION_FAILED', 'cannot issue a code for yourself');
  end if;
  if not exists (select 1 from public.profiles where id = p_customer_id) then
    perform private.raise_error('NOT_FOUND', 'customer');
  end if;
  perform private.consume_rate_limit('recovery_issue', v_uid::text);

  if p_channel = 'in_store' then
    perform private.record_identity_check(p_customer_id, p_business_id, p_evidence, 'passed', null);
  end if;

  update ops.recovery_codes set status = 'revoked' where user_id = p_customer_id and status = 'open';

  v_code := private.random_recovery_code((private.get_setting('auth.recovery.code_length'))::integer);
  v_expires := now() + make_interval(secs => v_ttl);
  insert into ops.recovery_codes (user_id, code_hash, channel, issued_by, issued_business_id, reason, expires_at)
  values (p_customer_id, private.recovery_code_hash(v_code), p_channel, v_uid, p_business_id, p_reason, v_expires)
  returning id into v_id;

  perform audit.write('recovery.code_issued', 'recovery_code', v_id, null,
    jsonb_build_object('user_id', p_customer_id, 'channel', p_channel, 'reason', p_reason,
                       'remote', p_channel = 'owner_remote', 'expires_at', v_expires),
    p_business_id);
  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;

-- auth-recover (service role). Never raises on a bad code, so the attempt counter commits.
-- Returns {ok, user_id?}. A valid code is consumed (single use) before the password changes.
create or replace function api.svc_consume_recovery_code(p_phone_e164 text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_row ops.recovery_codes%rowtype;
  v_max integer := (private.get_setting('auth.recovery.code_max_attempts'))::integer;
begin
  select id into v_user from public.profiles
  where phone_e164 = p_phone_e164 and account_status = 'active';
  if v_user is null then
    return jsonb_build_object('ok', false);
  end if;
  select * into v_row from ops.recovery_codes
  where user_id = v_user and status = 'open' for update;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  if v_row.expires_at <= now() then
    update ops.recovery_codes set status = 'expired' where id = v_row.id;
    return jsonb_build_object('ok', false);
  end if;
  -- Compares fixed-length digests; the plain code is never stored.
  if v_row.code_hash <> private.recovery_code_hash(coalesce(p_code, '')) then
    update ops.recovery_codes
    set attempts = attempts + 1,
        status = case when attempts + 1 >= v_max then 'revoked'::ops.recovery_code_status else status end
    where id = v_row.id;
    return jsonb_build_object('ok', false);
  end if;
  update ops.recovery_codes set status = 'used', used_at = now() where id = v_row.id;
  perform audit.write_as(v_user, 'recovery.code_used', 'recovery_code', v_row.id, null,
    jsonb_build_object('channel', v_row.channel), v_row.issued_business_id);
  return jsonb_build_object('ok', true, 'user_id', v_user);
end;
$$;
