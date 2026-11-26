-- Owner dashboard lists: api.list_offers, api.list_staff (owner only, 2026-11-26).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000024aa', '910000002401', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e1000000-0000-0000-0000-0000000024e1', '910000002402', '{"full_name":"Exec"}', '{"account_type":"staff"}');
insert into public.businesses (id, slug, name, timezone) values
  ('b1000000-0000-0000-0000-0000000024b1', 'biz-lists-1', 'Biz Lists 1', 'UTC');
select private.grant_role('a0000000-0000-0000-0000-0000000024aa', 'owner', null, null);
select private.grant_role('e1000000-0000-0000-0000-0000000024e1', 'executive', 'b1000000-0000-0000-0000-0000000024b1', null);
insert into public.staff (user_id, business_id, display_name) values
  ('a0000000-0000-0000-0000-0000000024aa', null, 'Owner'),
  ('e1000000-0000-0000-0000-0000000024e1', 'b1000000-0000-0000-0000-0000000024b1', 'Exec')
  on conflict (user_id) do nothing;
insert into public.offers (business_id, title, status) values
  ('b1000000-0000-0000-0000-0000000024b1', 'Draft offer', 'draft');
insert into auth.sessions (id, user_id) values
  ('51000000-0000-0000-0000-0000000024e1', 'e1000000-0000-0000-0000-0000000024e1'),
  ('50000000-0000-0000-0000-0000000024aa', 'a0000000-0000-0000-0000-0000000024aa');

select ok(not has_function_privilege('anon', 'api.list_offers(uuid)', 'execute'), 'anon cannot list offers');
select ok(not has_function_privilege('anon', 'api.list_staff()', 'execute'), 'anon cannot list staff');

set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000024e1","role":"authenticated","session_id":"51000000-0000-0000-0000-0000000024e1"}';
select throws_ok($$select * from api.list_offers()$$, 'PT403', 'FORBIDDEN', 'executive cannot list all offers');
select throws_ok($$select * from api.list_staff()$$, 'PT403', 'FORBIDDEN', 'executive cannot list staff');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000024aa","role":"authenticated","session_id":"50000000-0000-0000-0000-0000000024aa"}';
select ok(exists (select 1 from api.list_offers() where title = 'Draft offer'), 'owner sees draft offers');
select is((select count(*)::int from api.list_offers('b1000000-0000-0000-0000-0000000024b1')), 1, 'business filter');
select is((select role from api.list_staff() where user_id = 'e1000000-0000-0000-0000-0000000024e1'), 'executive', 'executive listed');
select is((select business_name from api.list_staff() where user_id = 'e1000000-0000-0000-0000-0000000024e1'), 'Biz Lists 1', 'business name joined');

select * from finish();
rollback;
