drop trigger if exists set_updated_at on public.error_codes;
create trigger set_updated_at before update on public.error_codes
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.app_settings;
create trigger set_updated_at before update on public.app_settings
  for each row execute function private.set_updated_at();

drop trigger if exists inherit_schema on public.app_settings;
create trigger inherit_schema before insert or update on public.app_settings
  for each row execute function private.app_settings_inherit_schema();
