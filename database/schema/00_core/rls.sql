-- Deny by default: RLS on, no policies. Settings are read only through private.get_setting.
alter table public.error_codes enable row level security;
alter table public.app_settings enable row level security;
