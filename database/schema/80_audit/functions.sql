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
  perform private.raise_error('AUDIT_APPEND_ONLY', tg_op);
  return null;
end;
$$;
