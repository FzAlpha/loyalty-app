create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.roles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.permissions
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.user_roles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.identity_checks
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.phone_release_requests
  for each row execute function private.set_updated_at();

-- Profile + customer role for every new auth user (§7.1).
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_auth_user();
create trigger on_auth_user_phone_changed after update of phone on auth.users
  for each row when (old.phone is distinct from new.phone)
  execute function private.sync_auth_user_phone();
