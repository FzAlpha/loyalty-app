revoke all on table public.businesses from public, anon, authenticated;
grant select on table public.businesses to anon, authenticated;

revoke all on function api.update_business(uuid, jsonb) from public, anon;
grant execute on function api.update_business(uuid, jsonb) to authenticated;
revoke all on function api.list_businesses() from public;
grant execute on function api.list_businesses() to anon, authenticated;
revoke all on function private.business_name(uuid) from public, anon, authenticated;
revoke all on function private.business_is_active(uuid) from public, anon, authenticated;
revoke all on function private.require_business_active(uuid) from public, anon, authenticated;
revoke all on function api.create_business(jsonb) from public, anon;
grant execute on function api.create_business(jsonb) to authenticated;
revoke all on function api.delete_business(uuid) from public, anon;
grant execute on function api.delete_business(uuid) to authenticated;
revoke all on function api.list_managed_businesses() from public, anon;
grant execute on function api.list_managed_businesses() to authenticated;
