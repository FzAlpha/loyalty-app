-- F1 customer-app backend: get_my_account, digital card pass (create + scan), redemption history,
-- list_businesses / business fields, offer categories, partners. Runs as postgres inside one
-- rolled-back transaction. now() is fixed for the whole transaction, so expiry is tested by moving
-- expires_at into the past.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(53);

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000022aa', '910000002201', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e1000000-0000-0000-0000-0000000022e1', '910000002202', '{"full_name":"Exec"}', '{"account_type":"staff"}'),
  ('c1000000-0000-0000-0000-0000000022c1', '919800002201', '{"full_name":"Cust One"}', '{}'),
  ('c2000000-0000-0000-0000-0000000022c2', '919800002202', '{"full_name":"Cust Two"}', '{}');
insert into public.businesses (id, slug, name, category, website_url, is_active) values
  ('b1000000-0000-0000-0000-0000000022b1', 'f1-biz-a', 'F1 Biz A', 'Furniture', 'https://a.example', true),
  ('b2000000-0000-0000-0000-0000000022b2', 'f1-biz-b', 'F1 Biz B', 'Mattress', null, false);
select private.grant_role('a0000000-0000-0000-0000-0000000022aa', 'owner', null, null);
select private.grant_role('e1000000-0000-0000-0000-0000000022e1', 'executive', 'b1000000-0000-0000-0000-0000000022b1', null);
insert into public.staff (user_id, business_id, display_name) values
  ('a0000000-0000-0000-0000-0000000022aa', null, 'Owner'),
  ('e1000000-0000-0000-0000-0000000022e1', 'b1000000-0000-0000-0000-0000000022b1', 'Exec');
insert into auth.sessions (id, user_id) values
  ('5a000000-0000-0000-0000-0000000022aa', 'a0000000-0000-0000-0000-0000000022aa'),
  ('5e100000-0000-0000-0000-0000000022e1', 'e1000000-0000-0000-0000-0000000022e1'),
  ('5c100000-0000-0000-0000-0000000022c1', 'c1000000-0000-0000-0000-0000000022c1'),
  ('5c200000-0000-0000-0000-0000000022c2', 'c2000000-0000-0000-0000-0000000022c2');
update public.profiles set membership_status = 'active' where id = 'c1000000-0000-0000-0000-0000000022c1';
insert into public.card_batches (id, label, quantity, created_by) values
  ('ba000000-0000-0000-0000-0000000022ba', 'f1 test', 1, 'a0000000-0000-0000-0000-0000000022aa');
insert into public.cards (id, batch_id, card_number, token_hash, status, current_customer_id) values
  ('cad10000-0000-0000-0000-0000000022c1', 'ba000000-0000-0000-0000-0000000022ba', 'T-F1-1', '\x2201', 'active',
   'c1000000-0000-0000-0000-0000000022c1');
insert into public.offers (id, business_id, title, status, starts_at, category_id) values
  ('0f000000-0000-0000-0000-000000002201', 'b1000000-0000-0000-0000-0000000022b1', 'Sofa deal', 'active',
   now() - interval '10 days', (select id from public.offer_categories where key = 'member_discounts'));
insert into public.redemptions (claim_token_id, idempotency_key, customer_id, card_id, offer_id, business_id, executive_id,
                                bill_amount, redeemed_at) values
  (gen_random_uuid(), 'f1-test-key-1', 'c1000000-0000-0000-0000-0000000022c1', 'cad10000-0000-0000-0000-0000000022c1',
   '0f000000-0000-0000-0000-000000002201', 'b1000000-0000-0000-0000-0000000022b1', 'e1000000-0000-0000-0000-0000000022e1', 1200, now() - interval '1 day'),
  (gen_random_uuid(), 'f1-test-key-2', 'c1000000-0000-0000-0000-0000000022c1', 'cad10000-0000-0000-0000-0000000022c1',
   '0f000000-0000-0000-0000-000000002201', 'b1000000-0000-0000-0000-0000000022b1', 'e1000000-0000-0000-0000-0000000022e1', null, now() - interval '2 days'),
  (gen_random_uuid(), 'f1-test-key-3', 'c1000000-0000-0000-0000-0000000022c1', 'cad10000-0000-0000-0000-0000000022c1',
   '0f000000-0000-0000-0000-000000002201', 'b1000000-0000-0000-0000-0000000022b1', 'e1000000-0000-0000-0000-0000000022e1', 300, now() - interval '3 days');

create temp table q (name text primary key, r jsonb);
grant select on q to authenticated;

-- ---------------------------------------------------------------- structure + grants
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relrowsecurity
             and c.relname in ('card_passes', 'offer_categories', 'partners', 'partner_offers')),
          4, 'RLS on all F1 tables');
select ok(not has_table_privilege('authenticated', 'public.card_passes', 'select,insert,update,delete'),
          'clients have no access to card_passes');
select ok(not has_function_privilege('anon', 'api.create_card_pass()', 'execute'), 'anon cannot create card passes');
select ok(has_function_privilege('anon', 'api.list_businesses()', 'execute'), 'anon can list businesses');
select ok(not has_function_privilege('authenticated', 'private.business_name(uuid)', 'execute'), 'private helper closed');

-- ---------------------------------------------------------------- get_my_account
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000022c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000022c1"}';
select is(api.get_my_account() -> 'card', '{"card_number":"T-F1-1","status":"active"}'::jsonb, 'account shows own card');
select is(api.get_my_account() ->> 'membership_status', 'active', 'account shows membership');
set local request.jwt.claims = '{"sub":"c2000000-0000-0000-0000-0000000022c2","role":"authenticated","session_id":"5c200000-0000-0000-0000-0000000022c2"}';
select is(api.get_my_account() -> 'card', 'null'::jsonb, 'no card is null');
set local request.jwt.claims = '{"sub":"c2000000-0000-0000-0000-0000000022c2","role":"authenticated","session_id":"dead0000-0000-0000-0000-000000000000"}';
select throws_ok($$select api.get_my_account()$$, 'PT403', 'FORBIDDEN', 'revoked session cannot read account');

-- ---------------------------------------------------------------- card pass
set local request.jwt.claims = '{"sub":"c2000000-0000-0000-0000-0000000022c2","role":"authenticated","session_id":"5c200000-0000-0000-0000-0000000022c2"}';
select throws_ok($$select api.create_card_pass()$$, 'PT409', 'CARD_INACTIVE', 'no card, no pass');

set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000022c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000022c1"}';
insert into q values ('p1', api.create_card_pass());
select ok((select r ->> 'qr_payload' from q where name = 'p1')
            ~ '^GR\.P\.1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$', 'pass payload is GR.P.1.<id>.<32-byte secret>');
select is((select expires_at from public.card_passes where customer_id = 'c1000000-0000-0000-0000-0000000022c1'),
          now() + interval '300 seconds', 'expiry from cards.pass_ttl_seconds');
select is((select r ->> 'card_number' from q where name = 'p1'), 'T-F1-1', 'pass returns card number');
insert into q values ('p2', api.create_card_pass());
select is((select count(*)::int from public.card_passes where customer_id = 'c1000000-0000-0000-0000-0000000022c1'), 1,
          'one pass row per customer');
select is((select id from public.card_passes where customer_id = 'c1000000-0000-0000-0000-0000000022c1'),
          split_part((select r ->> 'qr_payload' from q where name = 'p2'), '.', 4)::uuid, 'new pass replaces the old one');
select throws_ok($$select private.parse_card_pass_qr('GR.P.2.' || split_part((select r ->> 'qr_payload' from q where name = 'p2'), '.', 4)
                   || '.' || split_part((select r ->> 'qr_payload' from q where name = 'p2'), '.', 5))$$,
                 'PT400', 'INVALID_QR', 'unknown pass version rejected');

-- scan (executive)
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000022e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000022e1"}';
select is(api.scan_card((select r ->> 'qr_payload' from q where name = 'p2'), 'b1000000-0000-0000-0000-0000000022b1') ->> 'card_number',
          'T-F1-1', 'executive scans a digital pass');
select throws_ok($$select api.scan_card((select r ->> 'qr_payload' from q where name = 'p1'), 'b1000000-0000-0000-0000-0000000022b1')$$,
                 'PT400', 'INVALID_QR', 'replaced pass is rejected');
select throws_ok($$select api.scan_card('GR.P.1.' || split_part((select r ->> 'qr_payload' from q where name = 'p2'), '.', 4)
                   || '.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'b1000000-0000-0000-0000-0000000022b1')$$,
                 'PT400', 'INVALID_QR', 'wrong secret is rejected');
select throws_ok($$select api.scan_card('GR.Q.1.' || split_part((select r ->> 'qr_payload' from q where name = 'p2'), '.', 4)
                   || '.' || split_part((select r ->> 'qr_payload' from q where name = 'p2'), '.', 5), 'b1000000-0000-0000-0000-0000000022b1')$$,
                 'PT400', 'INVALID_QR', 'claim kind is not a pass');
update public.card_passes set expires_at = now() - interval '1 second' where customer_id = 'c1000000-0000-0000-0000-0000000022c1';
select throws_ok($$select api.scan_card((select r ->> 'qr_payload' from q where name = 'p2'), 'b1000000-0000-0000-0000-0000000022b1')$$,
                 'PT409', 'CARD_PASS_EXPIRED', 'expired pass is rejected');
update public.card_passes set expires_at = now() + interval '1 minute' where customer_id = 'c1000000-0000-0000-0000-0000000022c1';
update public.cards set status = 'blocked' where id = 'cad10000-0000-0000-0000-0000000022c1';
select throws_ok($$select api.scan_card((select r ->> 'qr_payload' from q where name = 'p2'), 'b1000000-0000-0000-0000-0000000022b1')$$,
                 'PT409', 'CARD_INACTIVE', 'pass for a blocked card is rejected');
update public.cards set status = 'active' where id = 'cad10000-0000-0000-0000-0000000022c1';
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000022c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000022c1"}';
select throws_ok($$select api.scan_card((select r ->> 'qr_payload' from q where name = 'p2'), 'b1000000-0000-0000-0000-0000000022b1')$$,
                 'PT403', 'FORBIDDEN', 'customer cannot scan');

-- ---------------------------------------------------------------- redemption history (customer c1)
select is((select count(*)::int from api.list_my_redemptions()), 3, 'customer sees own history');
select is((select offer_title || '|' || business_name from api.list_my_redemptions() limit 1), 'Sofa deal|F1 Biz A',
          'history shows offer and business names');
select ok((select redeemed_at = now() - interval '1 day' from api.list_my_redemptions() limit 1), 'newest first');
select is((select count(*)::int from api.list_my_redemptions(null, 2)), 2, 'limit respected');
select is((select count(*)::int from api.list_my_redemptions(now() - interval '1 day')), 2, 'p_before pages strictly older rows');
select throws_ok($$select * from api.list_my_redemptions(null, 0)$$, 'PT400', 'VALIDATION_FAILED', 'limit below 1 rejected');
update public.app_settings set value = '2' where key = 'customer.history.page_max' and scope_business_id is null;
select is((select count(*)::int from api.list_my_redemptions(null, 10)), 2, 'limit capped by customer.history.page_max');
set local request.jwt.claims = '{"sub":"c2000000-0000-0000-0000-0000000022c2","role":"authenticated","session_id":"5c200000-0000-0000-0000-0000000022c2"}';
select is((select count(*)::int from api.list_my_redemptions()), 0, 'other customer sees none');

-- ---------------------------------------------------------------- businesses
set local role anon;
select ok(exists(select 1 from api.list_businesses() where name = 'F1 Biz A' and category = 'Furniture'
                 and website_url = 'https://a.example'), 'anon lists active businesses with category and website');
select ok(not exists(select 1 from api.list_businesses() where name = 'F1 Biz B'), 'inactive businesses hidden');
reset role;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000022aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000022aa"}';
select is(api.update_business('b1000000-0000-0000-0000-0000000022b1', '{"website_url":"https://b.example","category":" Beds "}')
          ->> 'website_url', 'https://b.example', 'owner sets website_url');
select is((select category from public.businesses where id = 'b1000000-0000-0000-0000-0000000022b1'), 'Beds', 'category trimmed');
select throws_ok($$select api.update_business('b1000000-0000-0000-0000-0000000022b1', '{"website_url":"http://b.example"}')$$,
                 'PT400', 'VALIDATION_FAILED', 'website_url must be https');

-- ---------------------------------------------------------------- offer categories
insert into q values ('o', api.upsert_offer(jsonb_build_object('business_id', 'b1000000-0000-0000-0000-0000000022b1',
  'title', 'Family deal', 'category_id', (select id from public.offer_categories where key = 'friends_family'))));
select is((select c.key from public.offers o join public.offer_categories c on c.id = o.category_id
           where o.id = (select (r ->> 'offer_id')::uuid from q where name = 'o')), 'friends_family', 'upsert_offer sets category');
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000022c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000022c1"}';
select ok((select array_agg(key order by sort_order, name) from api.list_offer_categories())
            @> array['member_discounts', 'friends_family', 'exclusive_deals'], 'seeded categories listed');
select is((select category_key from api.list_eligible_offers() where id = '0f000000-0000-0000-0000-000000002201'),
          'member_discounts', 'eligible offers carry category_key');

-- ---------------------------------------------------------------- partners
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000022e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000022e1"}';
select throws_ok($$select api.upsert_partner('{"name":"X"}')$$, 'PT403', 'FORBIDDEN', 'executive cannot manage partners');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000022aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000022aa"}';
insert into q values ('pt', api.upsert_partner('{"name":"SkyTrips","website_url":"https://sky.example"}'));
select is((select r ->> 'is_active' from q where name = 'pt'), 'true', 'owner creates partner');
select throws_ok($$select api.upsert_partner('{"name":"Bad","website_url":"http://bad.example"}')$$,
                 'PT400', 'VALIDATION_FAILED', 'partner website must be https');
insert into q values ('po', api.upsert_partner_offer(jsonb_build_object('partner_id', (select r ->> 'partner_id' from q where name = 'pt'),
  'title', 'Flights 10% off', 'discount_text', 'Up to 10% off', 'claim_url', 'https://sky.example/members')));
select is((select r ->> 'status' from q where name = 'po'), 'draft', 'new partner offer starts as draft');

set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000022c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000022c1"}';
select is((select count(*)::int from api.list_partner_offers() where partner_name = 'SkyTrips'), 0, 'draft not listed');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000022aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000022aa"}';
select is(api.set_partner_offer_status((select (r ->> 'partner_offer_id')::uuid from q where name = 'po'), 'active') ->> 'status',
          'active', 'owner activates partner offer');

set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000022c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000022c1"}';
select is((select discount_text from api.list_partner_offers() where partner_name = 'SkyTrips'), 'Up to 10% off',
          'member sees active partner offer');
set local role authenticated;
select is((select count(*)::int from public.partner_offers), 0, 'no direct partner_offers reads for customers');
select ok(exists(select 1 from public.partners where name = 'SkyTrips'), 'active partners readable');
reset role;

set local request.jwt.claims = '{"sub":"c2000000-0000-0000-0000-0000000022c2","role":"authenticated","session_id":"5c200000-0000-0000-0000-0000000022c2"}';
select is((select count(*)::int from api.list_partner_offers()), 0, 'non-member gets an empty list');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000022aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000022aa"}';
select is(api.set_partner_offer_status((select (r ->> 'partner_offer_id')::uuid from q where name = 'po'), 'archived') ->> 'status',
          'archived', 'owner archives partner offer');
select throws_ok($$select api.set_partner_offer_status((select (r ->> 'partner_offer_id')::uuid from q where name = 'po'), 'active')$$,
                 'PT409', 'CONFLICT', 'archived is final');
select throws_ok($$select api.upsert_partner_offer(jsonb_build_object('id', (select r ->> 'partner_offer_id' from q where name = 'po'),
                   'title', 'x'))$$, 'PT409', 'CONFLICT', 'archived partner offer cannot be edited');
select is((select count(*)::int from audit.audit_logs where action in ('partner.created', 'partner_offer.created',
           'partner_offer.status_changed') and entity_id in ((select (r ->> 'partner_id')::uuid from q where name = 'pt'),
           (select (r ->> 'partner_offer_id')::uuid from q where name = 'po'))), 4, 'partner changes audited');

select * from finish();
rollback;
