-- 99_jobs: pg_cron entries from jobs.*.cron settings, run_job dispatch, process_deletions needs
-- Vault config; 80_audit retention purge (M9).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000099aa', '910000009901', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('c1000000-0000-0000-0000-0000000099c1', '919800009901', '{"full_name":"Cust"}', '{}');
insert into public.businesses (id, slug, name, timezone) values
  ('b1000000-0000-0000-0000-0000000099b1', 'jobs-biz-1', 'Jobs Biz 1', 'UTC');
select private.grant_role('a0000000-0000-0000-0000-0000000099aa', 'owner', null, null);

-- ---------------------------------------------------------------- schedules
select ok(exists (select 1 from pg_extension where extname = 'pg_cron'), 'pg_cron installed');
select ok(exists (select 1 from pg_extension where extname = 'pg_net'), 'pg_net installed');
select is((select count(*)::int from cron.job where jobname like 'rewards.%'), 8, 'all 8 jobs scheduled');
select is((select schedule from cron.job where jobname = 'rewards.expire_claims'), '*/5 * * * *', 'schedule from jobs.expire_claims.cron');
select is((select schedule from cron.job where jobname = 'rewards.audit_retention'), '30 22 * * 0', 'schedule from jobs.audit_retention.cron');
select is((select command from cron.job where jobname = 'rewards.process_deletions'),
          $$select private.run_job('process_deletions')$$, 'cron entry calls run_job');

insert into auth.sessions (id, user_id) values
  ('50000000-0000-0000-0000-0000000099aa', 'a0000000-0000-0000-0000-0000000099aa');
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000099aa","role":"authenticated","session_id":"50000000-0000-0000-0000-0000000099aa"}';
select lives_ok($$select api.set_setting('jobs.expire_claims.cron', '"*/10 * * * *"')$$, 'owner changes a schedule');
select is((select schedule from cron.job where jobname = 'rewards.expire_claims'), '*/10 * * * *', 'cron entry re-registered');
select throws_ok($$select api.set_setting('jobs.expire_claims.cron', '"not a cron"')$$, 'PT400', 'VALIDATION_FAILED',
                 'invalid cron expression rejected');
select is((select schedule from cron.job where jobname = 'rewards.expire_claims'), '*/10 * * * *', 'bad schedule left the entry alone');

-- ---------------------------------------------------------------- run_job
select throws_ok($$select private.run_job('nope')$$, 'PT400', 'VALIDATION_FAILED', 'unknown job');
select lives_ok($$select private.run_job(n) from unnest(array['expire_claims', 'purge_claim_tokens', 'purge_login_attempts',
                  'purge_rate_limit_buckets', 'expire_recovery_codes', 'purge_unchecked_accounts', 'audit_retention']) n$$,
                'every SQL job runs');
select is(private.run_job('process_deletions'), 0, 'process_deletions is a no-op when nothing is due');
select private.begin_account_deletion('c1000000-0000-0000-0000-0000000099c1', 'customer_request',
                                      'c1000000-0000-0000-0000-0000000099c1', now() - interval '1 second');
select throws_ok($$select private.job_process_deletions()$$, 'PT503', 'JOBS_NOT_CONFIGURED', 'due work without Vault secrets fails loudly');
select ok(not has_function_privilege('authenticated', 'private.run_job(text)', 'execute'), 'authenticated cannot run jobs');

-- ---------------------------------------------------------------- audit retention (80_audit)
insert into audit.audit_logs (action, entity_type, created_at) values
  ('test.old', 'test', now() - make_interval(days => (private.get_setting('retention.audit_logs_days'))::integer + 1)),
  ('test.recent', 'test', now());
select is(audit.purge_expired(), 1, 'one row past retention purged');
select ok(not exists (select 1 from audit.audit_logs where action = 'test.old')
          and exists (select 1 from audit.audit_logs where action = 'test.recent'), 'recent rows kept');
select throws_ok($$delete from audit.audit_logs where action = 'test.recent'$$, 'PT403', 'AUDIT_APPEND_ONLY',
                 'direct delete still blocked after a purge');
select is(current_setting('rewards.audit_purge', true), 'off', 'purge flag reset');

select * from finish();
rollback;
