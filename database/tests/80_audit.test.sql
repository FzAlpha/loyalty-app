begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

select ok((select relrowsecurity from pg_class where oid = 'audit.audit_logs'::regclass), 'RLS on audit_logs');
select ok(not has_table_privilege('authenticated', 'audit.audit_logs', 'select'), 'authenticated cannot read audit_logs');
select ok(not has_function_privilege('authenticated', 'audit.write(text,text,uuid,jsonb,jsonb,uuid)', 'execute'), 'authenticated cannot call audit.write');

-- request context captured from headers / JWT
set local request.headers = '{"x-request-id":"req-test-1","x-forwarded-for":"203.0.113.9, 10.0.0.1"}';
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select audit.write('test.action', 'test', '66666666-6666-6666-6666-666666666666', null, '{"a":1}', null);
select is((select request_id from audit.audit_logs where action = 'test.action'), 'req-test-1', 'request id captured');
select is((select ip from audit.audit_logs where action = 'test.action'), '203.0.113.9'::inet, 'client ip captured');
select is((select actor_id from audit.audit_logs where action = 'test.action'), '55555555-5555-5555-5555-555555555555'::uuid, 'actor from JWT');

-- generic row trigger on app_settings
insert into public.app_settings (key, value, value_schema, description) values ('t.audited', '1', '{"type":"integer"}', 'audit test');
select is((select count(*)::int from audit.audit_logs where action = 'app_settings.insert' and after ->> 'key' = 't.audited'), 1, 'settings insert audited');

-- append-only
select throws_ok($$update audit.audit_logs set action = 'x'$$, 'PT403', 'AUDIT_APPEND_ONLY', 'update blocked');
select throws_ok($$delete from audit.audit_logs$$, 'PT403', 'AUDIT_APPEND_ONLY', 'delete blocked');

select * from finish();
rollback;
