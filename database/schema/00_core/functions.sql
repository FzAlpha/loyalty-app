-- core helpers. All helpers use search_path = '' and fully qualified names.

-- Raise a catalogued error. SQLSTATE 'PT<status>' makes PostgREST answer with that HTTP status;
-- message = error code, detail = context.
create or replace function private.raise_error(p_code text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status integer;
begin
  select e.http_status into v_status from public.error_codes e where e.code = p_code;
  if v_status is null then
    raise exception using errcode = 'PT500', message = 'UNKNOWN_ERROR_CODE', detail = coalesce(p_code, '');
  end if;
  raise exception using errcode = 'PT' || v_status::text, message = p_code, detail = coalesce(p_detail, '');
end;
$$;

-- Business-specific value first, then global, else SETTING_NOT_FOUND. No silent defaults.
create or replace function private.get_setting(p_key text, p_business_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value jsonb;
begin
  if p_business_id is not null then
    select s.value into v_value from public.app_settings s
     where s.key = p_key and s.scope_business_id = p_business_id;
    if found then return v_value; end if;
  end if;
  select s.value into v_value from public.app_settings s
   where s.key = p_key and s.scope_business_id is null;
  if found then return v_value; end if;
  perform private.raise_error('SETTING_NOT_FOUND', p_key);
  return null; -- unreachable
end;
$$;

-- Request context (PostgREST sets request.headers as JSON with lower-case names).
create or replace function private.request_header(p_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.headers', true), '')::jsonb ->> lower(p_name);
$$;

create or replace function private.request_ip()
returns inet
language plpgsql
stable
set search_path = ''
as $$
declare
  v_first text := trim(split_part(coalesce(private.request_header('x-forwarded-for'), ''), ',', 1));
begin
  return nullif(v_first, '')::inet;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Authentication helper. Authorization (private.can / private.require_permission) lives in 10_identity.
create or replace function private.require_auth()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform private.raise_error('UNAUTHENTICATED');
  end if;
  return v_uid;
end;
$$;

-- Trigger helpers
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- A business override always uses the global row's schema, so it is validated the same way.
create or replace function private.app_settings_inherit_schema()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schema jsonb;
begin
  if new.scope_business_id is not null then
    select s.value_schema into v_schema from public.app_settings s
     where s.key = new.key and s.scope_business_id is null;
    if v_schema is null then
      perform private.raise_error('SETTING_NOT_FOUND', new.key);
    end if;
    new.value_schema := v_schema;
  end if;
  return new;
end;
$$;

-- Service-role only: lets Edge Functions read a business rule (e.g. auth.password.min_length).
create or replace function api.svc_get_setting(p_key text, p_business_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.get_setting(p_key, p_business_id); $$;

-- Change a setting (plan §5, settings.manage at that scope; p_business_id null = global value).
-- The key must already exist globally (keys come from the seed). The value is checked against the
-- key's value_schema first so callers get VALIDATION_FAILED, not a raw check violation.
-- jobs.* keys are global only. The row audit trigger records before/after.
create or replace function api.set_setting(p_key text, p_value jsonb, p_business_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_global public.app_settings;
  v_row public.app_settings;
begin
  if not private.can('settings.manage', p_business_id) then
    perform private.raise_error('FORBIDDEN', 'settings.manage');
  end if;
  if p_value is null then
    perform private.raise_error('VALIDATION_FAILED', 'value');
  end if;
  select * into v_global from public.app_settings where key = p_key and scope_business_id is null for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'setting');
  end if;
  if p_business_id is not null then
    if not exists (select 1 from public.businesses where id = p_business_id) then
      perform private.raise_error('VALIDATION_FAILED', 'business_id');
    end if;
    if p_key like 'jobs.%' then
      perform private.raise_error('VALIDATION_FAILED', 'jobs settings are global only');
    end if;
  end if;
  if not extensions.jsonb_matches_schema(v_global.value_schema::json, p_value) then
    perform private.raise_error('VALIDATION_FAILED', 'value does not match schema');
  end if;

  if p_business_id is null then
    update public.app_settings set value = p_value, updated_by = v_uid
    where id = v_global.id returning * into v_row;
  else
    insert into public.app_settings (key, scope_business_id, value, value_schema, description, updated_by)
    values (p_key, p_business_id, p_value, v_global.value_schema, v_global.description, v_uid)
    on conflict (key, coalesce(scope_business_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set value = excluded.value, updated_by = excluded.updated_by
    returning * into v_row;
  end if;
  return jsonb_build_object('key', v_row.key, 'business_id', v_row.scope_business_id, 'value', v_row.value,
                            'updated_at', v_row.updated_at);
end;
$$;
