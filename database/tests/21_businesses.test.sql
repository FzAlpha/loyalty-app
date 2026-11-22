-- 20_businesses api.update_business (M9).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000002aa', '910000000201', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e1000000-0000-0000-0000-0000000002e1', '910000000202', '{"full_name":"Exec"}', '{"account_type":"staff"}');
insert into public.businesses (id, slug, name, timezone) values
  ('b1000000-0000-0000-0000-0000000002b1', 'biz-edit-1', 'Biz Edit 1', 'UTC');
select private.grant_role('a0000000-0000-0000-0000-0000000002aa', 'owner', null, null);
select private.grant_role('e1000000-0000-0000-0000-0000000002e1', 'executive', 'b1000000-0000-0000-0000-0000000002b1', null);
create temp table q (name text primary key, r jsonb);

select ok(not has_function_privilege('anon', 'api.update_business(uuid,jsonb)', 'execute'), 'anon cannot edit businesses');

insert into auth.sessions (id, user_id) values
  ('51000000-0000-0000-0000-0000000002e1', 'e1000000-0000-0000-0000-0000000002e1'),
  ('50000000-0000-0000-0000-0000000002aa', 'a0000000-0000-0000-0000-0000000002aa');
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000002e1","role":"authenticated","session_id":"51000000-0000-0000-0000-0000000002e1"}';
select throws_ok($$select api.update_business('b1000000-0000-0000-0000-0000000002b1', '{"name":"X"}')$$,
                 'PT403', 'FORBIDDEN', 'executive cannot edit the business');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000002aa","role":"authenticated","session_id":"50000000-0000-0000-0000-0000000002aa"}';
insert into q values ('u', api.update_business('b1000000-0000-0000-0000-0000000002b1',
  '{"name":"  New Name ","address":"1 Main St","timezone":"Asia/Kolkata"}'));
select is((select r ->> 'name' from q where name = 'u'), 'New Name', 'owner renames (trimmed)');
select is((select timezone from public.businesses where id = 'b1000000-0000-0000-0000-0000000002b1'), 'Asia/Kolkata', 'timezone updated');
select api.update_business('b1000000-0000-0000-0000-0000000002b1', '{"address":null}');
select ok((select address is null and name = 'New Name' from public.businesses where id = 'b1000000-0000-0000-0000-0000000002b1'),
          'null clears a field, other fields kept');
select throws_ok($$select api.update_business('b1000000-0000-0000-0000-0000000002b1', '{"slug":"other"}')$$,
                 'PT400', 'VALIDATION_FAILED', 'slug cannot be changed');
select throws_ok($$select api.update_business('b1000000-0000-0000-0000-0000000002b1', '{"timezone":"Mars/Base"}')$$,
                 'PT400', 'VALIDATION_FAILED', 'unknown time zone rejected');
select throws_ok($$select api.update_business('b1000000-0000-0000-0000-0000000002b1', '{}')$$,
                 'PT400', 'VALIDATION_FAILED', 'empty patch rejected');
select throws_ok($$select api.update_business('b9999999-0000-0000-0000-000000000000', '{"name":"X"}')$$,
                 'PT404', 'NOT_FOUND', 'unknown business');
select ok(exists (select 1 from audit.audit_logs where action = 'businesses.update'
                  and entity_id = 'b1000000-0000-0000-0000-0000000002b1' and after ->> 'name' = 'New Name'), 'edit is audited');

select * from finish();
rollback;
