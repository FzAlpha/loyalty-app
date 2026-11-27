revoke all on table public.staff from public, anon, authenticated;
grant select on table public.staff to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function api.svc_staff_upsert(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function api.svc_staff_set_active(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function api.svc_staff_mark_password_reset(uuid, uuid) from public, anon, authenticated;
grant execute on function api.svc_staff_upsert(uuid, uuid, text, uuid, text) to service_role;
grant execute on function api.svc_staff_set_active(uuid, uuid, boolean) to service_role;
grant execute on function api.svc_staff_mark_password_reset(uuid, uuid) to service_role;

revoke all on function api.staff_password_changed() from public, anon;
grant execute on function api.staff_password_changed() to authenticated;

revoke all on function api.get_my_staff() from public, anon;
grant execute on function api.get_my_staff() to authenticated;
revoke all on function api.list_staff() from public, anon;
grant execute on function api.list_staff() to authenticated;
revoke all on function private.create_partner_staff(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.staff_role_label(uuid) from public, anon, authenticated;
