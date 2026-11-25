revoke all on table public.businesses from public, anon, authenticated;
grant select on table public.businesses to anon, authenticated;

revoke all on function api.update_business(uuid, jsonb) from public, anon;
grant execute on function api.update_business(uuid, jsonb) to authenticated;
revoke all on function api.list_businesses() from public;
grant execute on function api.list_businesses() to anon, authenticated;
revoke all on function private.business_name(uuid) from public, anon, authenticated;
