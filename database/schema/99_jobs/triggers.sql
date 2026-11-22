drop trigger if exists register_job on public.app_settings;
create trigger register_job after insert or update of value on public.app_settings
  for each row
  when (new.scope_business_id is null and new.key ~ '^jobs\.[a-z0-9_]+\.cron$')
  execute function private.app_settings_register_job();

-- Existing databases: pick up schedules already stored (fresh databases register from the seed).
select private.register_jobs();
