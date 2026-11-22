revoke all on table public.deletion_requests from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function api.request_account_deletion() from public, anon;
grant execute on function api.request_account_deletion() to authenticated;

revoke all on function api.svc_claim_due_deletions(integer) from public, anon, authenticated;
grant execute on function api.svc_claim_due_deletions(integer) to service_role;
revoke all on function api.svc_complete_deletion(uuid, text) from public, anon, authenticated;
grant execute on function api.svc_complete_deletion(uuid, text) to service_role;
