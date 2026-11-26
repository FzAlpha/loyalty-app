-- 20_businesses api.update_business (M9), create / delete / deactivate (owner, 2026-11-26).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(25);

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

-- create / delete / list (owner scope only)
select ok(not has_function_privilege('anon', 'api.create_business(jsonb)', 'execute'), 'anon cannot create businesses');
select ok(not has_function_privilege('anon', 'api.delete_business(uuid)', 'execute'), 'anon cannot delete businesses');
insert into q values ('c1', api.create_business('{"name":"  Biz New One ","category":"Food","timezone":"Asia/Kolkata"}'));
select is((select r ->> 'slug' from q where name = 'c1'), 'biz-new-one', 'slug made from the name');
select is((select r ->> 'is_active' from q where name = 'c1'), 'true', 'new business is active');
insert into q values ('c2', api.create_business('{"name":"Biz New One"}'));
select is((select r ->> 'slug' from q where name = 'c2'), 'biz-new-one-2', 'duplicate slug gets a suffix');
insert into q values ('c3', api.create_business('{"name":"Café Ñandú"}'));
select is((select r ->> 'slug' from q where name = 'c3'), 'cafe-nandu', 'accents removed from the slug');
select throws_ok($$select api.create_business('{"name":"  "}')$$, 'PT400', 'VALIDATION_FAILED', 'blank name rejected');
select throws_ok($$select api.create_business('{"name":"X","slug":"x"}')$$, 'PT400', 'VALIDATION_FAILED', 'unknown field rejected');
select ok(exists (select 1 from api.list_managed_businesses() b where b.id = 'b1000000-0000-0000-0000-0000000002b1'),
          'owner list includes existing businesses');
select is(api.delete_business((select (r ->> 'id')::uuid from q where name = 'c2')),
          jsonb_build_object('asset_bucket', private.get_setting('storage.bucket.business_assets') #>> '{}',
                             'asset_prefix', (select r ->> 'id' from q where name = 'c2')),
          'unused business deleted; returns its file folder');
select ok(not exists (select 1 from public.businesses where id = (select (r ->> 'id')::uuid from q where name = 'c2')),
          'deleted business row is gone');
select throws_ok($$select api.delete_business('b1000000-0000-0000-0000-0000000002b1')$$,
                 'PT409', 'BUSINESS_IN_USE', 'business with staff/history cannot be deleted');

-- deactivate: staff actions refused, owner can reactivate
select api.update_business('b1000000-0000-0000-0000-0000000002b1', '{"is_active":false}');
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000002e1","role":"authenticated","session_id":"51000000-0000-0000-0000-0000000002e1"}';
select throws_ok($$select api.scan_card('x', 'b1000000-0000-0000-0000-0000000002b1')$$,
                 'PT409', 'BUSINESS_INACTIVE', 'card scan refused at an inactive business');
select throws_ok($$select api.create_business('{"name":"Exec Biz"}')$$, 'PT403', 'FORBIDDEN', 'executive cannot create');
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000002aa","role":"authenticated","session_id":"50000000-0000-0000-0000-0000000002aa"}';
select api.update_business('b1000000-0000-0000-0000-0000000002b1', '{"is_active":true}');
select ok(private.business_is_active('b1000000-0000-0000-0000-0000000002b1'), 'owner reactivates');

select * from finish();
rollback;
