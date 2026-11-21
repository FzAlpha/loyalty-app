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

-- Authorization helpers (§5). M1 stubs: deny by default until identity/roles land in M2,
-- which replaces the bodies of private.can and private.require_permission.
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

create or replace function private.can(p_permission text, p_business_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false; -- M1 stub: no roles exist yet
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
