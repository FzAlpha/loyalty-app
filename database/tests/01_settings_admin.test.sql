-- 00_core api.set_setting (M9): permission, schema validation, business overrides, jobs.* global only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000001aa', '910000000101', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e1000000-0000-0000-0000-0000000001e1', '910000000102', '{"full_name":"Exec"}', '{"account_type":"staff"}');
insert into public.businesses (id, slug, name, timezone) values
  ('b1000000-0000-0000-0000-0000000001b1', 'settings-biz-1', 'Settings Biz 1', 'UTC');
select private.grant_role('a0000000-0000-0000-0000-0000000001aa', 'owner', null, null);
select private.grant_role('e1000000-0000-0000-0000-0000000001e1', 'executive', 'b1000000-0000-0000-0000-0000000001b1', null);
create temp table q (name text primary key, r jsonb);

select ok(not has_function_privilege('anon', 'api.set_setting(text,jsonb,uuid)', 'execute'), 'anon cannot set settings');

set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000001e1","role":"authenticated"}';
select throws_ok($$select api.set_setting('claims.ttl_seconds', '300')$$, 'PT403', 'FORBIDDEN', 'executive cannot change a global setting');
select throws_ok($$select api.set_setting('claims.ttl_seconds', '300', 'b1000000-0000-0000-0000-0000000001b1')$$,
                 'PT403', 'FORBIDDEN', 'executive cannot override for their business');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000001aa","role":"authenticated"}';
insert into q values ('g', api.set_setting('claims.ttl_seconds', '300'));
select is((select r -> 'value' from q where name = 'g'), '300'::jsonb, 'owner changes a global setting');
select is(private.get_setting('claims.ttl_seconds'), '300'::jsonb, 'new global value is read back');
select is((select updated_by from public.app_settings where key = 'claims.ttl_seconds' and scope_business_id is null),
          'a0000000-0000-0000-0000-0000000001aa'::uuid, 'updated_by is the caller');
select throws_ok($$select api.set_setting('claims.ttl_seconds', '"soon"')$$, 'PT400', 'VALIDATION_FAILED', 'value must match the schema');
select throws_ok($$select api.set_setting('no.such.key', '1')$$, 'PT404', 'NOT_FOUND', 'unknown key');
select throws_ok($$select api.set_setting('claims.ttl_seconds', null)$$, 'PT400', 'VALIDATION_FAILED', 'null value rejected');

select api.set_setting('claims.ttl_seconds', '120', 'b1000000-0000-0000-0000-0000000001b1');
select api.set_setting('claims.ttl_seconds', '90', 'b1000000-0000-0000-0000-0000000001b1');
select ok(private.get_setting('claims.ttl_seconds', 'b1000000-0000-0000-0000-0000000001b1') = '90'::jsonb
          and private.get_setting('claims.ttl_seconds') = '300'::jsonb, 'business override wins, global unchanged');
select is((select count(*)::int from public.app_settings where key = 'claims.ttl_seconds'
           and scope_business_id = 'b1000000-0000-0000-0000-0000000001b1'), 1, 'second override updates the same row');
select throws_ok($$select api.set_setting('jobs.expire_claims.cron', '"*/5 * * * *"', 'b1000000-0000-0000-0000-0000000001b1')$$,
                 'PT400', 'VALIDATION_FAILED', 'jobs settings are global only');
select throws_ok($$select api.set_setting('claims.ttl_seconds', '60', 'b9999999-0000-0000-0000-000000000000')$$,
                 'PT400', 'VALIDATION_FAILED', 'unknown business rejected');

select * from finish();
rollback;
