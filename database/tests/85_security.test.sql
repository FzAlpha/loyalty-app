-- 85_security + staff RPCs: lockout, rate limit, recovery codes, session revocation.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(26);

insert into public.businesses (id, slug, name) values ('b1000000-0000-0000-0000-000000000001', 'biz-one', 'Biz One');
insert into auth.users (id, phone, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', '910000000001', '{"account_type":"staff"}'),
  ('e0000000-0000-0000-0000-00000000000e', '910000000002', '{"account_type":"staff"}'),
  ('c0000000-0000-0000-0000-00000000000c', '919876543210', '{}'),
  -- Like Auth Admin createUser: row inserted without account_type, so the trigger grants 'customer'.
  ('f0000000-0000-0000-0000-00000000000f', '910000000003', '{}');
select private.grant_role('a0000000-0000-0000-0000-00000000000a', 'owner', null, null);
insert into public.staff (user_id, business_id, display_name) values ('a0000000-0000-0000-0000-00000000000a', null, 'Owner');
insert into auth.sessions (id, user_id) values
  ('5a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a'),
  ('5e000000-0000-0000-0000-00000000000e', 'e0000000-0000-0000-0000-00000000000e'),
  ('5c000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-00000000000c'),
  ('5c000000-0000-0000-0000-0000000000c2', 'c0000000-0000-0000-0000-00000000000c');
-- Test-only bucket; recovery_issue raised so the seeded limit does not interfere (rolled back).
insert into public.app_settings (key, value, value_schema, description) values
  ('ratelimit.test', '{"capacity":2,"per_seconds":3600}', '{"type":"object"}', 'test');
update public.app_settings set value = '{"capacity":100,"per_seconds":60}'
  where key = 'ratelimit.recovery_issue' and scope_business_id is null;

select ok(not has_table_privilege('authenticated', 'ops.recovery_codes', 'select'), 'authenticated cannot read recovery codes');
select ok(not has_function_privilege('authenticated', 'api.svc_consume_recovery_code(text,text)', 'execute'), 'consume is service-role only');
select ok(not has_function_privilege('authenticated', 'api.svc_login_result(text,boolean,inet)', 'execute'), 'login_result is service-role only');

-- staff-admin RPCs (actor checked from argument)
select throws_ok($$select api.svc_staff_upsert('c0000000-0000-0000-0000-00000000000c', 'e0000000-0000-0000-0000-00000000000e', 'executive', 'b1000000-0000-0000-0000-000000000001', 'Exec')$$,
  'PT403', 'FORBIDDEN', 'non-owner actor rejected');
select throws_ok($$select api.svc_staff_upsert('a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000e', 'executive', null, 'Exec')$$,
  'PT400', 'VALIDATION_FAILED', 'executive needs a business');
select lives_ok($$select api.svc_staff_upsert('a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000e', 'executive', 'b1000000-0000-0000-0000-000000000001', 'Exec')$$,
  'owner creates executive');
select ok(private.user_can('e0000000-0000-0000-0000-00000000000e', 'customer.recover', 'b1000000-0000-0000-0000-000000000001'), 'executive role granted');
select lives_ok($$select api.svc_staff_set_active('a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000e', false)$$, 'owner disables executive');
select ok(not private.user_can('e0000000-0000-0000-0000-00000000000e', 'customer.recover', 'b1000000-0000-0000-0000-000000000001'), 'disabled executive loses permissions');
select lives_ok($$select api.svc_staff_set_active('a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000e', true)$$, 'owner re-enables executive');
select lives_ok($$select api.svc_staff_upsert('a0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-00000000000f', 'executive', 'b1000000-0000-0000-0000-000000000001', 'Exec 2')$$,
  'owner makes a signed-up user an executive');
select ok(not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = 'f0000000-0000-0000-0000-00000000000f' and ur.is_active and r.key = 'customer'),
  'staff upsert removes the customer role');

-- rate limit
select lives_ok($$select private.consume_rate_limit('test', 'k')$$, 'token 1');
select lives_ok($$select private.consume_rate_limit('test', 'k')$$, 'token 2');
select throws_ok($$select private.consume_rate_limit('test', 'k')$$, 'PT429', 'RATE_LIMITED', 'bucket empty');
select throws_ok($$select private.consume_rate_limit('undecided', 'k')$$, 'PT500', 'SETTING_NOT_FOUND', 'missing limit fails closed');

-- lockout (seeded: 5 failures -> locked)
select is(api.svc_login_result('+910000000099', false, null), null, 'failure 1 not locked');
select api.svc_login_result('+910000000099', false, null) from generate_series(2, 4);
select isnt(api.svc_login_result('+910000000099', false, null), null, 'failure 5 locks');
select isnt(api.svc_login_guard('+910000000099'), null, 'guard reports lock');
select is(api.svc_login_result('+910000000099', true, null), null, 'success clears');

-- recovery: in-store issue by executive, then redeem
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated","session_id":"5e000000-0000-0000-0000-00000000000e"}';
create temp table t_code as select api.issue_recovery_code('c0000000-0000-0000-0000-00000000000c', 'in_store',
  'b1000000-0000-0000-0000-000000000001', null, array['registration_details']::public.identity_evidence[]) as r;
select is(char_length((select r ->> 'code' from t_code)), 8, 'code has configured length');
select is((select api.svc_consume_recovery_code('+919876543210', 'WRONG000') ->> 'ok'), 'false', 'wrong code rejected');
select is((select attempts from ops.recovery_codes where user_id = 'c0000000-0000-0000-0000-00000000000c' and status = 'open'), 1, 'failed attempt counted');
select is((select api.svc_consume_recovery_code('+919876543210', (select r ->> 'code' from t_code)) ->> 'ok'), 'true', 'right code accepted');
select is((select api.svc_consume_recovery_code('+919876543210', (select r ->> 'code' from t_code)) ->> 'ok'), 'false', 'code is single use');
select is(api.svc_revoke_user_sessions(null, 'c0000000-0000-0000-0000-00000000000c', 'recovery'), 2, 'all customer sessions revoked');

select * from finish();
rollback;
