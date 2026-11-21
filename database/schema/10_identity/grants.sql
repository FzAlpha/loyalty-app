revoke all on table public.profiles, public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.identity_checks, public.phone_release_requests
  from public, anon, authenticated;

-- Read-only through RLS.
grant select on table public.profiles, public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.identity_checks, public.phone_release_requests
  to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;

-- Send SMS Hook: only Supabase Auth may call it (§7.1).
grant usage on schema private to supabase_auth_admin;
grant execute on function private.auth_send_sms_hook(jsonb) to supabase_auth_admin;

revoke all on function api.has_permission(text, uuid) from public, anon;
revoke all on function api.has_any_permission(text) from public, anon;
revoke all on function api.record_identity_check(uuid, uuid, public.identity_evidence[], public.identity_check_result, text) from public, anon;
revoke all on function api.request_phone_release(text, uuid, text) from public, anon;
revoke all on function api.decide_phone_release(uuid, boolean, text) from public, anon;
grant execute on function api.has_permission(text, uuid) to authenticated;
grant execute on function api.has_any_permission(text) to authenticated;
grant execute on function api.record_identity_check(uuid, uuid, public.identity_evidence[], public.identity_check_result, text) to authenticated;
grant execute on function api.request_phone_release(text, uuid, text) to authenticated;
grant execute on function api.decide_phone_release(uuid, boolean, text) to authenticated;
