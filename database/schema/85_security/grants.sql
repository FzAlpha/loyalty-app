revoke all on all tables in schema ops from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function api.svc_rate_limit(text, text) from public, anon, authenticated;
revoke all on function api.svc_revoke_user_sessions(uuid, uuid, text) from public, anon, authenticated;
revoke all on function api.svc_login_guard(text) from public, anon, authenticated;
revoke all on function api.svc_login_result(text, boolean, inet) from public, anon, authenticated;
revoke all on function api.svc_consume_recovery_code(text, text) from public, anon, authenticated;
grant execute on function api.svc_rate_limit(text, text) to service_role;
grant execute on function api.svc_revoke_user_sessions(uuid, uuid, text) to service_role;
grant execute on function api.svc_login_guard(text) to service_role;
grant execute on function api.svc_login_result(text, boolean, inet) to service_role;
grant execute on function api.svc_consume_recovery_code(text, text) to service_role;

revoke all on function api.issue_recovery_code(uuid, public.recovery_channel, uuid, text, public.identity_evidence[]) from public, anon;
grant execute on function api.issue_recovery_code(uuid, public.recovery_channel, uuid, text, public.identity_evidence[]) to authenticated;
