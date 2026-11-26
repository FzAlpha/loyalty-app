-- F2 admin-app backend: api.get_my_staff and api.list_my_redemptions_today. Runs as postgres inside
-- one rolled-back transaction. now() is fixed for the transaction, so "today" is tested against
-- local midnight in the business time zone.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000023aa', '910000002301', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e1000000-0000-0000-0000-0000000023e1', '910000002302', '{"full_name":"Exec A"}', '{"account_type":"staff"}'),
  ('e2000000-0000-0000-0000-0000000023e2', '910000002303', '{"full_name":"Exec A2"}', '{"account_type":"staff"}'),
  ('e3000000-0000-0000-0000-0000000023e3', '910000002304', '{"full_name":"Exec B"}', '{"account_type":"staff"}'),
  ('c1000000-0000-0000-0000-0000000023c1', '919800002301', '{"full_name":"Cust One"}', '{}');
insert into public.businesses (id, slug, name, timezone, is_active) values
  ('b1000000-0000-0000-0000-0000000023b1', 'f2-biz-a', 'F2 Biz A', 'Asia/Kolkata', true),
  ('b2000000-0000-0000-0000-0000000023b2', 'f2-biz-b', 'F2 Biz B', 'Asia/Kolkata', true);
select private.grant_role('a0000000-0000-0000-0000-0000000023aa', 'owner', null, null);
select private.grant_role('e1000000-0000-0000-0000-0000000023e1', 'executive', 'b1000000-0000-0000-0000-0000000023b1', null);
select private.grant_role('e2000000-0000-0000-0000-0000000023e2', 'executive', 'b1000000-0000-0000-0000-0000000023b1', null);
select private.grant_role('e3000000-0000-0000-0000-0000000023e3', 'executive', 'b2000000-0000-0000-0000-0000000023b2', null);
insert into public.staff (user_id, business_id, display_name) values
  ('a0000000-0000-0000-0000-0000000023aa', null, 'Owner'),
  ('e1000000-0000-0000-0000-0000000023e1', 'b1000000-0000-0000-0000-0000000023b1', 'Exec A'),
  ('e2000000-0000-0000-0000-0000000023e2', 'b1000000-0000-0000-0000-0000000023b1', 'Exec A2'),
  ('e3000000-0000-0000-0000-0000000023e3', 'b2000000-0000-0000-0000-0000000023b2', 'Exec B');
insert into auth.sessions (id, user_id) values
  ('5a000000-0000-0000-0000-0000000023aa', 'a0000000-0000-0000-0000-0000000023aa'),
  ('5e100000-0000-0000-0000-0000000023e1', 'e1000000-0000-0000-0000-0000000023e1'),
  ('5e300000-0000-0000-0000-0000000023e3', 'e3000000-0000-0000-0000-0000000023e3'),
  ('5c100000-0000-0000-0000-0000000023c1', 'c1000000-0000-0000-0000-0000000023c1');
insert into public.card_batches (id, label, quantity, created_by) values
  ('ba000000-0000-0000-0000-0000000023ba', 'f2 test', 1, 'a0000000-0000-0000-0000-0000000023aa');
insert into public.cards (id, batch_id, card_number, token_hash, status, current_customer_id) values
  ('cad10000-0000-0000-0000-0000000023c1', 'ba000000-0000-0000-0000-0000000023ba', 'T-F2-1', '\x2301', 'active',
   'c1000000-0000-0000-0000-0000000023c1');
insert into public.offers (id, business_id, title, status, starts_at) values
  ('0f000000-0000-0000-0000-000000002301', 'b1000000-0000-0000-0000-0000000023b1', 'Chair deal', 'active', now() - interval '10 days'),
  ('0f000000-0000-0000-0000-000000002302', 'b2000000-0000-0000-0000-0000000023b2', 'Bed deal', 'active', now() - interval '10 days');

create temp table t (midnight timestamptz);
insert into t select date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
grant select on t to authenticated;

insert into public.redemptions (claim_token_id, idempotency_key, customer_id, card_id, offer_id, business_id, executive_id,
                                bill_number, bill_amount, redeemed_at) values
  -- Exec A at A: now, local midnight (included), one second before midnight (yesterday, excluded)
  (gen_random_uuid(), 'f2-test-key-1', 'c1000000-0000-0000-0000-0000000023c1', 'cad10000-0000-0000-0000-0000000023c1',
   '0f000000-0000-0000-0000-000000002301', 'b1000000-0000-0000-0000-0000000023b1', 'e1000000-0000-0000-0000-0000000023e1',
   'B-1', 1500, now()),
  (gen_random_uuid(), 'f2-test-key-2', 'c1000000-0000-0000-0000-0000000023c1', 'cad10000-0000-0000-0000-0000000023c1',
   '0f000000-0000-0000-0000-000000002301', 'b1000000-0000-0000-0000-0000000023b1', 'e1000000-0000-0000-0000-0000000023e1',
   null, null, (select midnight from t)),
  (gen_random_uuid(), 'f2-test-key-3', 'c1000000-0000-0000-0000-0000000023c1', 'cad10000-0000-0000-0000-0000000023c1',
   '0f000000-0000-0000-0000-000000002301', 'b1000000-0000-0000-0000-0000000023b1', 'e1000000-0000-0000-0000-0000000023e1',
   null, 200, (select midnight from t) - interval '1 second'),
  -- Exec A2 at A today (another executive), Exec B at B today
  (gen_random_uuid(), 'f2-test-key-4', 'c1000000-0000-0000-0000-0000000023c1', 'cad10000-0000-0000-0000-0000000023c1',
   '0f000000-0000-0000-0000-000000002301', 'b1000000-0000-0000-0000-0000000023b1', 'e2000000-0000-0000-0000-0000000023e2',
   null, null, now()),
  (gen_random_uuid(), 'f2-test-key-5', 'c1000000-0000-0000-0000-0000000023c1', 'cad10000-0000-0000-0000-0000000023c1',
   '0f000000-0000-0000-0000-000000002302', 'b2000000-0000-0000-0000-0000000023b2', 'e3000000-0000-0000-0000-0000000023e3',
   null, null, now());

-- ---------------------------------------------------------------- grants
select ok(not has_function_privilege('anon', 'api.get_my_staff()', 'execute'), 'anon cannot read staff context');
select ok(not has_function_privilege('anon', 'api.list_my_redemptions_today(uuid, timestamptz, integer)', 'execute'),
          'anon cannot list today');
select ok(has_function_privilege('authenticated', 'api.get_my_staff()', 'execute'), 'signed-in users can call get_my_staff');

-- ---------------------------------------------------------------- get_my_staff
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000023e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000023e1"}';
select is(api.get_my_staff() ->> 'role', 'executive', 'executive role');
select is(api.get_my_staff() ->> 'business_id', 'b1000000-0000-0000-0000-0000000023b1', 'executive business');
select is(api.get_my_staff() ->> 'business_name', 'F2 Biz A', 'executive business name');
select is(api.get_my_staff() ->> 'must_change_password', 'true', 'new staff must change password');
select api.staff_password_changed();
select is(api.get_my_staff() ->> 'must_change_password', 'false', 'flag cleared after password change');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000023aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000023aa"}';
select is(api.get_my_staff() ->> 'role', 'owner', 'owner role');
select is(api.get_my_staff() -> 'business_id', 'null'::jsonb, 'owner has no single business');

set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000023c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000023c1"}';
select throws_ok($$select api.get_my_staff()$$, 'PT404', 'NOT_FOUND', 'customer has no staff context');
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000023e1","role":"authenticated","session_id":"dead0000-0000-0000-0000-000000000000"}';
select throws_ok($$select api.get_my_staff()$$, 'PT403', 'FORBIDDEN', 'revoked session cannot read staff context');

-- ---------------------------------------------------------------- list_my_redemptions_today
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000023e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000023e1"}';
select is((select count(*)::int from api.list_my_redemptions_today('b1000000-0000-0000-0000-0000000023b1')), 2,
          'own redemptions since local midnight only (not yesterday, not other executives)');
select is((select offer_title || '|' || customer_name || '|' || bill_number
           from api.list_my_redemptions_today('b1000000-0000-0000-0000-0000000023b1') limit 1),
          'Chair deal|Cust One|B-1', 'newest first with offer, customer and bill');
select is((select phone_masked from api.list_my_redemptions_today('b1000000-0000-0000-0000-0000000023b1') limit 1),
          '******2301', 'phone is masked');
select is((select count(*)::int from api.list_my_redemptions_today('b1000000-0000-0000-0000-0000000023b1', null, 1)), 1,
          'limit respected');
select is((select count(*)::int from api.list_my_redemptions_today('b1000000-0000-0000-0000-0000000023b1', now())), 1,
          'p_before pages strictly older rows');
update public.app_settings set value = '1' where key = 'staff.today.page_max' and scope_business_id is null;
select is((select count(*)::int from api.list_my_redemptions_today('b1000000-0000-0000-0000-0000000023b1', null, 10)), 1,
          'limit capped by staff.today.page_max');
update public.app_settings set value = '100' where key = 'staff.today.page_max' and scope_business_id is null;
select throws_ok($$select * from api.list_my_redemptions_today('b2000000-0000-0000-0000-0000000023b2')$$,
                 'PT403', 'FORBIDDEN', 'executive cannot list another business');
select throws_ok($$select * from api.list_my_redemptions_today(null)$$, 'PT400', 'VALIDATION_FAILED', 'business required');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000023aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000023aa"}';
select is((select count(*)::int from api.list_my_redemptions_today('b2000000-0000-0000-0000-0000000023b2')), 0,
          'owner sees only their own redemptions');

set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000023c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000023c1"}';
select throws_ok($$select * from api.list_my_redemptions_today('b1000000-0000-0000-0000-0000000023b1')$$,
                 'PT403', 'FORBIDDEN', 'customer cannot list today');

update public.staff set is_active = false where user_id = 'e3000000-0000-0000-0000-0000000023e3';
set local request.jwt.claims = '{"sub":"e3000000-0000-0000-0000-0000000023e3","role":"authenticated","session_id":"5e300000-0000-0000-0000-0000000023e3"}';
select throws_ok($$select * from api.list_my_redemptions_today('b2000000-0000-0000-0000-0000000023b2')$$,
                 'PT403', 'FORBIDDEN', 'disabled executive is refused');
select is(api.get_my_staff() ->> 'is_active', 'false', 'disabled executive sees is_active false');

select * from finish();
rollback;
