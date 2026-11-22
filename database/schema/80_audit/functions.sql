-- Called inside every privileged RPC / Edge Function path. Actor and request context come from
-- the JWT and request headers, never from caller-supplied arguments.
create or replace function audit.write(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_business_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into audit.audit_logs (actor_id, actor_role, business_id, action, entity_type, entity_id,
                                before, after, request_id, ip)
  values (auth.uid(), coalesce(auth.jwt() ->> 'role', session_user::text), p_business_id, p_action,
          p_entity_type, p_entity_id, p_before, p_after,
          private.request_header('x-request-id'), private.request_ip())
  returning id into v_id;
  return v_id;
end;
$$;

-- For service-role RPCs called by Edge Functions: auth.uid() is null there, so the actor id
-- (taken from the caller's verified JWT by the Edge Function) is passed explicitly.
create or replace function audit.write_as(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_business_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into audit.audit_logs (actor_id, actor_role, business_id, action, entity_type, entity_id,
                                before, after, request_id, ip)
  values (p_actor_id, coalesce(auth.jwt() ->> 'role', session_user::text), p_business_id, p_action,
          p_entity_type, p_entity_id, p_before, p_after,
          private.request_header('x-request-id'), private.request_ip())
  returning id into v_id;
  return v_id;
end;
$$;

-- Generic row trigger. Optional TG_ARGV[0] = name of the row's business id column.
create or replace function audit.log_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  perform audit.write(
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_old,
    v_new,
    case when tg_nargs > 0 then (v_row ->> tg_argv[0])::uuid end
  );
  return null;
end;
$$;

create or replace function audit.block_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only audit.purge_expired may delete, and only rows already past retention.audit_logs_days.
  if tg_op = 'DELETE' and current_setting('rewards.audit_purge', true) = 'on' then
    if old.created_at < now() - make_interval(days => (private.get_setting('retention.audit_logs_days'))::integer) then
      return old;
    end if;
  end if;
  perform private.raise_error('AUDIT_APPEND_ONLY', tg_op);
  return null;
end;
$$;

-- audit_retention job (§9): deletes rows older than retention.audit_logs_days. The flag is local to
-- this transaction; block_change re-checks the age of every row.
create or replace function audit.purge_expired()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform set_config('rewards.audit_purge', 'on', true);
  delete from audit.audit_logs
  where created_at < now() - make_interval(days => (private.get_setting('retention.audit_logs_days'))::integer);
  get diagnostics v_count = row_count;
  perform set_config('rewards.audit_purge', 'off', true);
  return v_count;
end;
$$;

-- Audit viewer (plan §5 api.list_audit_logs, audit.view). p_business_id null = all businesses and
-- needs audit.view globally (owner). Newest first; keyset paging with (p_before_at, p_before_id).
-- Page size is capped by audit.page_size_max.
create or replace function api.list_audit_logs(
  p_business_id uuid default null,
  p_action text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_actor_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50)
returns table (id uuid, created_at timestamptz, actor_id uuid, actor_role text, business_id uuid,
               action text, entity_type text, entity_id uuid, before jsonb, after jsonb,
               request_id text, ip inet)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_auth();
  if not private.can('audit.view', p_business_id) then
    perform private.raise_error('FORBIDDEN', 'audit.view');
  end if;
  if p_limit is null or p_limit < 1 or p_limit > (private.get_setting('audit.page_size_max'))::integer then
    perform private.raise_error('VALIDATION_FAILED', 'limit');
  end if;
  if (p_before_at is null) <> (p_before_id is null) then
    perform private.raise_error('VALIDATION_FAILED', 'cursor');
  end if;
  return query
  select a.id, a.created_at, a.actor_id, a.actor_role, a.business_id, a.action, a.entity_type,
         a.entity_id, a.before, a.after, a.request_id, a.ip
  from audit.audit_logs a
  where (p_business_id is null or a.business_id = p_business_id)
    and (p_action is null or a.action = p_action)
    and (p_entity_type is null or a.entity_type = p_entity_type)
    and (p_entity_id is null or a.entity_id = p_entity_id)
    and (p_actor_id is null or a.actor_id = p_actor_id)
    and (p_from is null or a.created_at >= p_from)
    and (p_to is null or a.created_at < p_to)
    and (p_before_at is null or (a.created_at, a.id) < (p_before_at, p_before_id))
  order by a.created_at desc, a.id desc
  limit p_limit;
end;
$$;
