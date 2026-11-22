-- 99_jobs functions. Each job is a function owned by its module; this module only schedules them.
-- plpgsql so the module functions are resolved at call time.

create or replace function private.job_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['expire_claims', 'purge_claim_tokens', 'purge_login_attempts', 'purge_rate_limit_buckets',
               'expire_recovery_codes', 'purge_unchecked_accounts', 'process_deletions', 'audit_retention'];
$$;

-- process_deletions needs the Auth Admin API, so it calls the jobs-runner Edge Function through
-- pg_net (the request is sent after this transaction commits). The function URL base and the
-- shared secret come from Vault (secrets 'jobs_runner_url' and 'jobs_runner_secret'), never code.
create or replace function private.job_process_deletions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due integer := private.deletion_due_count();
  v_url text;
  v_secret text;
begin
  if v_due = 0 then
    return 0;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'jobs_runner_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'jobs_runner_secret';
  if v_url is null or v_secret is null then
    perform private.raise_error('JOBS_NOT_CONFIGURED', 'vault secrets jobs_runner_url / jobs_runner_secret');
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/jobs-runner',
    body := jsonb_build_object('job', 'process_deletions'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-jobs-secret', v_secret),
    timeout_milliseconds := 60000);
  return v_due;
end;
$$;

-- Entry point for every cron entry. Returns the number of rows the job touched.
create or replace function private.run_job(p_name text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  v_count := case p_name
    when 'expire_claims'            then private.expire_claims()
    when 'purge_claim_tokens'       then private.purge_claim_tokens()
    when 'purge_login_attempts'     then private.purge_login_attempts()
    when 'purge_rate_limit_buckets' then private.purge_rate_limit_buckets()
    when 'expire_recovery_codes'    then private.expire_recovery_codes()
    when 'purge_unchecked_accounts' then private.purge_unchecked_accounts()
    when 'process_deletions'        then private.job_process_deletions()
    when 'audit_retention'          then audit.purge_expired()
  end;
  if v_count is null then
    perform private.raise_error('VALIDATION_FAILED', 'unknown job: ' || coalesce(p_name, ''));
  end if;
  if v_count > 0 then
    perform audit.write('job.run', 'job', null, null, jsonb_build_object('job', p_name, 'count', v_count));
  end if;
  return v_count;
end;
$$;

-- (Re)creates the cron entry 'rewards.<name>' from the global jobs.<name>.cron setting.
-- cron.schedule replaces an entry with the same name.
create or replace function private.register_job(p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cron text;
begin
  if p_name is null or not (p_name = any (private.job_names())) then
    perform private.raise_error('VALIDATION_FAILED', 'unknown job: ' || coalesce(p_name, ''));
  end if;
  v_cron := private.get_setting('jobs.' || p_name || '.cron') #>> '{}';
  begin
    return cron.schedule('rewards.' || p_name, v_cron, format('select private.run_job(%L)', p_name));
  exception when others then
    perform private.raise_error('VALIDATION_FAILED', 'cron expression for ' || p_name);
    return null;
  end;
end;
$$;

-- Registers every job whose schedule setting exists (plan §9). Returns how many were registered.
create or replace function private.register_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_count integer := 0;
begin
  foreach v_name in array private.job_names() loop
    if exists (select 1 from public.app_settings
               where key = 'jobs.' || v_name || '.cron' and scope_business_id is null) then
      perform private.register_job(v_name);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- A schedule change is a settings update (seed or api.set_setting): re-register that job.
create or replace function private.app_settings_register_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.register_job(substring(new.key from '^jobs\.([a-z0-9_]+)\.cron$'));
  return null;
end;
$$;
