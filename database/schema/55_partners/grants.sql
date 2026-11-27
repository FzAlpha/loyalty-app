revoke all on table public.partner_applications from public, anon, authenticated;

revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function api.svc_partner_register(uuid, jsonb) from public, anon, authenticated;
grant execute on function api.svc_partner_register(uuid, jsonb) to service_role;

revoke all on function api.list_partner_applications(public.partner_status) from public, anon;
grant execute on function api.list_partner_applications(public.partner_status) to authenticated;
revoke all on function api.decide_partner(uuid, boolean, text) from public, anon;
grant execute on function api.decide_partner(uuid, boolean, text) to authenticated;
revoke all on function api.revoke_partner(uuid, text) from public, anon;
grant execute on function api.revoke_partner(uuid, text) to authenticated;
