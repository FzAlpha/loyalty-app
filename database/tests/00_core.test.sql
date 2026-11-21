begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(21);

-- structure + deny-by-default
select has_table('public', 'app_settings', 'app_settings exists');
select has_table('public', 'error_codes', 'error_codes exists');
select ok((select relrowsecurity from pg_class where oid = 'public.app_settings'::regclass), 'RLS on app_settings');
select ok((select relrowsecurity from pg_class where oid = 'public.error_codes'::regclass), 'RLS on error_codes');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('app_settings', 'error_codes')), 0, 'no policies on core tables');
select ok(not has_table_privilege('anon', 'public.app_settings', 'select'), 'anon cannot read app_settings');
select ok(not has_table_privilege('authenticated', 'public.app_settings', 'insert,update,delete'), 'authenticated cannot write app_settings');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated has no usage on private');
select ok(has_schema_privilege('service_role', 'api', 'usage'), 'service_role can reach api (Edge Functions)');
select ok(not has_function_privilege('authenticated', 'private.get_setting(text,uuid)', 'execute'), 'authenticated cannot call get_setting');

-- settings lookup
select is(private.get_setting('claims.ttl_seconds'), '600'::jsonb, 'global setting returned');
insert into public.businesses (id, slug, name) values ('11111111-1111-1111-1111-111111111111', 'test-biz', 'Test');
insert into public.app_settings (key, scope_business_id, value, value_schema, description)
values ('claims.ttl_seconds', '11111111-1111-1111-1111-111111111111', '300', '{}', 'test override');
select is(private.get_setting('claims.ttl_seconds', '11111111-1111-1111-1111-111111111111'), '300'::jsonb, 'business override wins');
select is(private.get_setting('claims.ttl_seconds', '22222222-2222-2222-2222-222222222222'), '600'::jsonb, 'other business falls back to global');
select is((select value_schema from public.app_settings where key = 'claims.ttl_seconds' and scope_business_id is not null),
          (select value_schema from public.app_settings where key = 'claims.ttl_seconds' and scope_business_id is null),
          'override inherits the global schema');
select throws_ok($$select private.get_setting('missing.key')$$, 'PT500', 'SETTING_NOT_FOUND', 'missing key raises');
select throws_ok($$insert into public.app_settings (key, value, value_schema, description) values ('t.bad', '"x"', '{"type":"integer"}', 'bad')$$,
                 '23514', null, 'value must match its schema');
select throws_ok($$insert into public.app_settings (key, scope_business_id, value, value_schema, description) values ('claims.ttl_seconds', '33333333-3333-3333-3333-333333333333', '"x"', '{}', 'bad')$$,
                 '23514', null, 'override validated against the global schema');
select throws_ok($$insert into public.app_settings (key, scope_business_id, value, value_schema, description) values ('no.global', '33333333-3333-3333-3333-333333333333', '1', '{}', 'bad')$$,
                 'PT500', 'SETTING_NOT_FOUND', 'override needs a global row');

-- errors + authz stubs
select throws_ok($$select private.raise_error('NOT_A_CODE')$$, 'PT500', 'UNKNOWN_ERROR_CODE', 'unknown code is caught');
select throws_ok($$select private.require_auth()$$, 'PT401', 'UNAUTHENTICATED', 'no JWT -> UNAUTHENTICATED');
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok($$select private.require_permission('card.view')$$, 'PT403', 'FORBIDDEN', 'no roles -> FORBIDDEN');

select * from finish();
rollback;
