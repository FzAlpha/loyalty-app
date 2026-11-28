-- Profile photos (plan §10, approved 2026-11-28): private bucket, storage policy check,
-- set_my_avatar / clear_my_avatar, get_my_account avatar summary, cleared on account deletion.
-- Runs as postgres inside one rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(28);

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('c1000000-0000-0000-0000-0000000011c1', '919800001101', '{"full_name":"Photo One"}', '{}'),
  ('c2000000-0000-0000-0000-0000000011c2', '919800001102', '{"full_name":"Photo Two"}', '{}');
insert into auth.sessions (id, user_id) values
  ('5c100000-0000-0000-0000-0000000011c1', 'c1000000-0000-0000-0000-0000000011c1'),
  ('5c200000-0000-0000-0000-0000000011c2', 'c2000000-0000-0000-0000-0000000011c2');
-- Objects uploaded through the Storage API (as postgres here; policies are checked below).
insert into storage.objects (bucket_id, name) values
  (private.get_setting('storage.bucket.customer_avatars') #>> '{}', 'c1000000-0000-0000-0000-0000000011c1/a1.jpg'),
  (private.get_setting('storage.bucket.customer_avatars') #>> '{}', 'c1000000-0000-0000-0000-0000000011c1/a2.png'),
  (private.get_setting('storage.bucket.customer_avatars') #>> '{}', 'c2000000-0000-0000-0000-0000000011c2/b1.jpg');

create temp table q (name text primary key, r jsonb);
grant select, insert on q to authenticated;

-- ---------------------------------------------------------------- structure
select is((select public from storage.buckets where id = private.get_setting('storage.bucket.customer_avatars') #>> '{}'),
          false, 'avatar bucket exists and is private');
select is((select file_size_limit from storage.buckets where id = private.get_setting('storage.bucket.customer_avatars') #>> '{}'),
          (private.get_setting('storage.avatar_max_file_bytes'))::bigint, 'avatar size limit from settings');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
           and policyname like 'rewards_avatars_%'), 4, 'avatar storage policies installed');
select ok(not has_function_privilege('anon', 'api.set_my_avatar(text)', 'execute')
          and has_function_privilege('authenticated', 'api.set_my_avatar(text)', 'execute'), 'set_my_avatar: authenticated only');
select ok(not has_function_privilege('anon', 'api.clear_my_avatar()', 'execute'), 'clear_my_avatar closed to anon');
select ok(not has_function_privilege('authenticated', 'private.avatar_summary(text)', 'execute'), 'private helper closed');

-- ---------------------------------------------------------------- storage policy check
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000011c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000011c1"}';
select ok(api.avatar_can_access('customer-avatars', 'c1000000-0000-0000-0000-0000000011c1/new.jpg'), 'own folder allowed');
select ok(not api.avatar_can_access('customer-avatars', 'c2000000-0000-0000-0000-0000000011c2/new.jpg'), 'other folder refused');
select ok(not api.avatar_can_access('customer-avatars', 'c1000000-0000-0000-0000-0000000011c1/x/new.jpg'), 'subfolder refused');
select ok(not api.avatar_can_access('customer-avatars', 'c1000000-0000-0000-0000-0000000011c1/new.gif'), 'other extension refused');
select ok(not api.avatar_can_access('offer-banners', 'c1000000-0000-0000-0000-0000000011c1/new.jpg'), 'other bucket refused');
select ok(not api.storage_can_write('customer-avatars', 'c1000000-0000-0000-0000-0000000011c1/new.jpg'),
          'asset policy does not open the avatar bucket');
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000011c1","role":"authenticated","session_id":"dead0000-0000-0000-0000-000000000000"}';
select ok(not api.avatar_can_access('customer-avatars', 'c1000000-0000-0000-0000-0000000011c1/new.jpg'), 'revoked session refused');
set local request.jwt.claims = '{"role":"anon"}';
select ok(not api.avatar_can_access('customer-avatars', 'c1000000-0000-0000-0000-0000000011c1/new.jpg'), 'anon refused');
select throws_ok($$select api.set_my_avatar('c1000000-0000-0000-0000-0000000011c1/a1.jpg')$$, 'PT401', 'UNAUTHENTICATED',
                 'anon cannot set a photo');

-- ---------------------------------------------------------------- set / clear
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000011c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000011c1"}';
select is(api.get_my_account() -> 'avatar' -> 'path', 'null'::jsonb, 'no photo by default');
select is((api.get_my_account() -> 'avatar' ->> 'url_ttl_seconds')::int,
          (private.get_setting('storage.avatar_url_ttl_seconds'))::int, 'signed URL lifetime from settings');
select throws_ok($$select api.set_my_avatar('c2000000-0000-0000-0000-0000000011c2/b1.jpg')$$, 'PT400', 'VALIDATION_FAILED',
                 'cannot point at another customer''s photo');
select throws_ok($$select api.set_my_avatar('c1000000-0000-0000-0000-0000000011c1/missing.jpg')$$, 'PT404', 'NOT_FOUND',
                 'object must exist');
insert into q values ('s1', api.set_my_avatar('c1000000-0000-0000-0000-0000000011c1/a1.jpg'));
select is((select r -> 'previous_path' from q where name = 's1'), 'null'::jsonb, 'first photo has no previous path');
insert into q values ('s2', api.set_my_avatar('c1000000-0000-0000-0000-0000000011c1/a2.png'));
select is((select r ->> 'previous_path' from q where name = 's2'), 'c1000000-0000-0000-0000-0000000011c1/a1.jpg',
          'replacing returns the old path');
select is(api.get_my_account() -> 'avatar' ->> 'path', 'c1000000-0000-0000-0000-0000000011c1/a2.png', 'account shows the photo');
select is((select count(*)::int from audit.audit_logs where action = 'profile.avatar_set'
           and entity_id = 'c1000000-0000-0000-0000-0000000011c1'), 2, 'photo changes audited');
insert into q values ('c1', api.clear_my_avatar());
select is((select r ->> 'previous_path' from q where name = 'c1'), 'c1000000-0000-0000-0000-0000000011c1/a2.png',
          'clear returns the old path');
select is((select avatar_path from public.profiles where id = 'c1000000-0000-0000-0000-0000000011c1'), null, 'photo cleared');

-- ---------------------------------------------------------------- inactive account and deletion
reset request.jwt.claims;
update public.profiles set account_status = 'disabled' where id = 'c2000000-0000-0000-0000-0000000011c2';
set local request.jwt.claims = '{"sub":"c2000000-0000-0000-0000-0000000011c2","role":"authenticated","session_id":"5c200000-0000-0000-0000-0000000011c2"}';
select throws_ok($$select api.set_my_avatar('c2000000-0000-0000-0000-0000000011c2/b1.jpg')$$, 'PT409', 'ACCOUNT_INACTIVE',
                 'disabled account cannot set a photo');
select ok(not api.avatar_can_access('customer-avatars', 'c2000000-0000-0000-0000-0000000011c2/b1.jpg'),
          'disabled account cannot reach its folder');
reset request.jwt.claims;
update public.profiles set account_status = 'active', avatar_path = 'c2000000-0000-0000-0000-0000000011c2/b1.jpg'
  where id = 'c2000000-0000-0000-0000-0000000011c2';
select private.anonymise_profile('c2000000-0000-0000-0000-0000000011c2', 'deletion_pending');
select is((select avatar_path from public.profiles where id = 'c2000000-0000-0000-0000-0000000011c2'), null,
          'account deletion clears the photo path');

select * from finish();
rollback;
