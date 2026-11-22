revoke all on table audit.audit_logs from public, anon, authenticated;
revoke all on all functions in schema audit from public, anon, authenticated;

revoke all on function api.list_audit_logs(uuid, text, text, uuid, uuid, timestamptz, timestamptz, timestamptz, uuid, integer) from public, anon;
grant execute on function api.list_audit_logs(uuid, text, text, uuid, uuid, timestamptz, timestamptz, timestamptz, uuid, integer) to authenticated;
