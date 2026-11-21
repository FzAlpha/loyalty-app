-- 10_identity + 20_businesses + 30_staff: signup trigger, permissions, staff gate, sessions,
-- identity checks, phone release. Runs as postgres inside one rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

-- fixtures
insert into public.businesses (id, slug, name) values
  ('b1000000-0000-0000-0000-000000000001', 'biz-one', 'Biz One'),
  ('b2000000-0000-0000-0000-000000000002', 'biz-two', 'Biz Two');
insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', '910000000001', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e0000000-0000-0000-0000-00000000000e', '910000000002', '{"full_name":"Exec"}',  '{"account_type":"staff"}'),
  ('c0000000-0000-0000-0000-00000000000c', '919876543210', '{"full_name":"Cust","date_of_birth":"1990-05-01"}', '{}'),
  ('c2000000-0000-0000-0000-0000000000c2', '919876543211', '{"full_name":"Cust Two"}', '{}');
select private.grant_role('a0000000-0000-0000-0000-00000000000a', 'owner', null, null);
select private.grant_role('e0000000-0000-0000-0000-00000000000e', 'executive', 'b1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a');
insert into public.staff (user_id, business_id, display_name) values
  ('a0000000-0000-0000-0000-00000000000a', null, 'Owner'),
  ('e0000000-0000-0000-0000-00000000000e', 'b1000000-0000-0000-0000-000000000001', 'Exec');
insert into auth.sessions (id, user_id) values
  ('5a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a'),
  ('5e000000-0000-0000-0000-00000000000e', 'e0000000-0000-0000-0000-00000000000e'),
  ('5c000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-00000000000c');

-- structure + deny-by-default
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname in ('profiles','roles','permissions','role_permissions','user_roles',
             'identity_checks','phone_release_requests','businesses','staff') and c.relrowsecurity), 9, 'RLS on all M2 public tables');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'insert,update,delete'), 'authenticated cannot write profiles');
select ok(not has_table_privilege('authenticated', 'public.user_roles', 'insert,update,delete'), 'authenticated cannot write user_roles');
select ok(not has_function_privilege('authenticated', 'api.svc_staff_upsert(uuid,uuid,text,uuid,text)', 'execute'), 'svc_staff_upsert is service-role only');
select ok(has_function_privilege('service_role', 'api.svc_staff_upsert(uuid,uuid,text,uuid,text)', 'execute'), 'service_role can call svc_staff_upsert');

-- signup trigger
select is((select phone_e164 from public.profiles where id = 'c0000000-0000-0000-0000-00000000000c'), '+919876543210', 'profile phone in E.164');
select is((select date_of_birth from public.profiles where id = 'c0000000-0000-0000-0000-00000000000c'), '1990-05-01'::date, 'date of birth copied');
select ok(exists(select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                 where ur.user_id = 'c0000000-0000-0000-0000-00000000000c' and r.key = 'customer'), 'customer role granted on signup');
select ok(not exists(select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                 where ur.user_id = 'e0000000-0000-0000-0000-00000000000e' and r.key = 'customer'), 'staff account gets no customer role');
update auth.users set phone = '919876543299' where id = 'c2000000-0000-0000-0000-0000000000c2';
select is((select phone_e164 from public.profiles where id = 'c2000000-0000-0000-0000-0000000000c2'), '+919876543299', 'phone change synced');

-- SMS hook refuses
select is(private.auth_send_sms_hook('{}'::jsonb) -> 'error' ->> 'http_code', '403', 'send_sms hook returns 403');
select ok(has_function_privilege('supabase_auth_admin', 'private.auth_send_sms_hook(jsonb)', 'execute'), 'auth admin can run the hook');
select ok(not has_function_privilege('authenticated', 'private.auth_send_sms_hook(jsonb)', 'execute'), 'authenticated cannot run the hook');

-- permissions (executive, live session)
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated","session_id":"5e000000-0000-0000-0000-00000000000e"}';
select ok(private.can('card.view', 'b1000000-0000-0000-0000-000000000001'), 'exec has card.view at own business');
select ok(not private.can('card.view', 'b2000000-0000-0000-0000-000000000002'), 'exec lacks card.view at other business');
select ok(not private.can('staff.manage', null), 'exec lacks staff.manage');
select ok(private.can_any('customer.view'), 'exec has customer.view somewhere');

-- identity check
select lives_ok($$select api.record_identity_check('c0000000-0000-0000-0000-00000000000c', 'b1000000-0000-0000-0000-000000000001',
  array['registration_details']::public.identity_evidence[], 'passed', null)$$, 'exec records identity check');
select ok((select identity_checked_at is not null from public.profiles where id = 'c0000000-0000-0000-0000-00000000000c'), 'identity_checked_at set on pass');
select throws_ok($$select api.record_identity_check('e0000000-0000-0000-0000-00000000000e', 'b1000000-0000-0000-0000-000000000001',
  array['registration_details']::public.identity_evidence[], 'passed', null)$$, 'PT400', 'VALIDATION_FAILED', 'cannot check own identity');
select throws_ok($$select api.record_identity_check('c0000000-0000-0000-0000-00000000000c', 'b2000000-0000-0000-0000-000000000002',
  array['registration_details']::public.identity_evidence[], 'passed', null)$$, 'PT403', 'FORBIDDEN', 'cannot check at other business');

-- phone release (two-step)
select throws_ok($$select api.request_phone_release('+919876543210', 'b1000000-0000-0000-0000-000000000001', 'not theirs')$$,
  'PT409', 'RELEASE_NOT_ALLOWED', 'checked holder cannot be released');
create temp table t_req as select api.request_phone_release('+919876543299', 'b1000000-0000-0000-0000-000000000001', 'not theirs') as id;
select is((select status from public.phone_release_requests where id = (select id from t_req)), 'pending'::public.phone_release_status, 'release request pending');
select throws_ok($$select api.request_phone_release('+919876543299', 'b1000000-0000-0000-0000-000000000001', 'again')$$,
  'PT409', 'CONFLICT', 'one pending request per phone');
select throws_ok($$select api.decide_phone_release((select id from t_req), true, null)$$, 'PT403', 'FORBIDDEN', 'exec cannot approve');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated","session_id":"5a000000-0000-0000-0000-00000000000a"}';
select ok(private.can('staff.manage', null), 'owner has staff.manage');
select is(api.decide_phone_release((select id from t_req), true, 'ok'), 'approved'::public.phone_release_status, 'owner approves');
select is((select account_status::text || ':' || coalesce(phone_e164, 'null') from public.profiles where id = 'c2000000-0000-0000-0000-0000000000c2'),
  'disabled:null', 'holder disabled and phone freed in profiles');

-- RLS read side: customer sees only own profile
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated","session_id":"5c000000-0000-0000-0000-00000000000c"}';
create temp table t_cnt (n int);
grant all on t_cnt to authenticated;
set local role authenticated;
insert into t_cnt select count(*) from public.profiles;
reset role;
select is((select n from t_cnt), 1, 'customer sees only own profile');

-- staff gate and session revocation
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated","session_id":"5e000000-0000-0000-0000-00000000000e"}';
update public.staff set is_active = false where user_id = 'e0000000-0000-0000-0000-00000000000e';
select ok(not private.can('card.view', 'b1000000-0000-0000-0000-000000000001'), 'disabled staff fails at once');
update public.staff set is_active = true where user_id = 'e0000000-0000-0000-0000-00000000000e';
delete from auth.sessions where id = '5e000000-0000-0000-0000-00000000000e';
select ok(not private.can('card.view', 'b1000000-0000-0000-0000-000000000001'), 'revoked session fails at once');

select * from finish();
rollback;
