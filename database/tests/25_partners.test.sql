-- Partner businesses (plan §4 partners, 2026-11-27): sign-up (svc_partner_register), owner decisions
-- (approve / reject / revoke), the partner role, partner offers and the customer side.
-- Runs as postgres inside one rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(49);

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000025aa', '910000002501', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e1000000-0000-0000-0000-0000000025e1', '910000002502', '{"full_name":"Exec"}', '{"account_type":"staff"}'),
  ('9a000000-0000-0000-0000-00000000259a', '910000002503', '{"full_name":"Pat Partner"}', '{"account_type":"staff"}'),
  ('c1000000-0000-0000-0000-0000000025c1', '919800002501', '{"full_name":"Cust One"}', '{}');
insert into public.businesses (id, slug, name, timezone) values
  ('b1000000-0000-0000-0000-0000000025b1', 'partners-test-group', 'Partners Test Group', 'UTC');
select private.grant_role('a0000000-0000-0000-0000-0000000025aa', 'owner', null, null);
select private.grant_role('e1000000-0000-0000-0000-0000000025e1', 'executive', 'b1000000-0000-0000-0000-0000000025b1', null);
insert into public.staff (user_id, business_id, display_name) values
  ('a0000000-0000-0000-0000-0000000025aa', null, 'Owner'),
  ('e1000000-0000-0000-0000-0000000025e1', 'b1000000-0000-0000-0000-0000000025b1', 'Exec');
insert into auth.sessions (id, user_id) values
  ('5a000000-0000-0000-0000-0000000025aa', 'a0000000-0000-0000-0000-0000000025aa'),
  ('5e100000-0000-0000-0000-0000000025e1', 'e1000000-0000-0000-0000-0000000025e1'),
  ('59a00000-0000-0000-0000-00000000259a', '9a000000-0000-0000-0000-00000000259a'),
  ('5c100000-0000-0000-0000-0000000025c1', 'c1000000-0000-0000-0000-0000000025c1');
update public.profiles set membership_status = 'active' where id = 'c1000000-0000-0000-0000-0000000025c1';
insert into public.card_batches (id, label, quantity, created_by) values
  ('ba000000-0000-0000-0000-0000000025ba', 'partners test', 1, 'a0000000-0000-0000-0000-0000000025aa');
insert into public.cards (id, batch_id, card_number, token_hash, status, current_customer_id) values
  ('cad10000-0000-0000-0000-0000000025c1', 'ba000000-0000-0000-0000-0000000025ba', 'T-P-1', '\x2501', 'active',
   'c1000000-0000-0000-0000-0000000025c1');

create temp table q (name text primary key, r jsonb);
grant select on q to authenticated;

-- ---------------------------------------------------------------- structure + grants
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.partner_applications'::regclass),
          'RLS on partner_applications');
select ok(not has_table_privilege('authenticated', 'public.partner_applications', 'select,insert,update,delete'),
          'clients have no access to partner_applications');
select ok(not has_function_privilege('authenticated', 'api.svc_partner_register(uuid, jsonb)', 'execute')
          and not has_function_privilege('anon', 'api.svc_partner_register(uuid, jsonb)', 'execute')
          and has_function_privilege('service_role', 'api.svc_partner_register(uuid, jsonb)', 'execute'),
          'svc_partner_register: service role only');
select ok(not has_function_privilege('anon', 'api.decide_partner(uuid, boolean, text)', 'execute'), 'anon cannot decide');
select ok(exists (select 1 from public.roles where key = 'partner'), 'partner role seeded');

-- ---------------------------------------------------------------- sign-up (service role side)
select throws_ok($$select api.svc_partner_register('9a000000-0000-0000-0000-00000000259a', '{"business_name":"Sky Trips"}')$$,
                 'PT400', 'VALIDATION_FAILED', 'contact name required');
select throws_ok($$select api.svc_partner_register('9a000000-0000-0000-0000-00000000259a', '{"business_name":"Sky Trips","contact_name":"Pat","role":"owner"}')$$,
                 'PT400', 'VALIDATION_FAILED', 'unknown fields refused');
insert into q values ('reg', api.svc_partner_register('9a000000-0000-0000-0000-00000000259a',
  '{"business_name":"Sky Trips","contact_name":"Pat Partner","category":"Travel","website_url":"https://sky.example","message":"Hello"}'));
insert into q select 'biz', jsonb_build_object('id', r ->> 'business_id') from q where name = 'reg';
select is((select r ->> 'status' from q where name = 'reg'), 'pending', 'application starts pending');
select is((select kind || '/' || is_active from public.businesses where id = (select (r ->> 'id')::uuid from q where name = 'biz')),
          'partner/false', 'partner business created inactive');
select is((select must_change_password from public.staff where user_id = '9a000000-0000-0000-0000-00000000259a'), false,
          'applicant chose own password');
select ok(not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                      where ur.user_id = '9a000000-0000-0000-0000-00000000259a' and ur.is_active),
          'no active role before approval (customer revoked)');
select throws_ok($$select api.svc_partner_register('9a000000-0000-0000-0000-00000000259a', '{"business_name":"Again","contact_name":"Pat"}')$$,
                 'PT409', 'CONFLICT', 'one application per account');
select throws_ok($$select api.svc_partner_register('e1000000-0000-0000-0000-0000000025e1', '{"business_name":"Exec Biz","contact_name":"Exec"}')$$,
                 'PT409', 'CONFLICT', 'existing staff cannot apply');

-- ---------------------------------------------------------------- pending partner
set local request.jwt.claims = '{"sub":"9a000000-0000-0000-0000-00000000259a","role":"authenticated","session_id":"59a00000-0000-0000-0000-00000000259a"}';
select is(api.get_my_staff() ->> 'role', 'partner', 'get_my_staff: partner role');
select is(api.get_my_staff() ->> 'partner_status', 'pending', 'get_my_staff: pending');
select throws_ok($$select api.upsert_offer(jsonb_build_object('business_id', (select r ->> 'id' from q where name = 'biz'), 'title', 'Early'))$$,
                 'PT403', 'FORBIDDEN', 'pending partner cannot create offers');

-- ---------------------------------------------------------------- owner decisions
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000025e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000025e1"}';
select throws_ok($$select * from api.list_partner_applications()$$, 'PT403', 'FORBIDDEN', 'executive cannot list applications');
select throws_ok($$select api.decide_partner((select (r ->> 'id')::uuid from q where name = 'biz'), true)$$,
                 'PT403', 'FORBIDDEN', 'executive cannot decide');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000025aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000025aa"}';
select is((select contact_name || '|' || applicant_phone || '|' || message from api.list_partner_applications('pending')
           where business_id = (select (r ->> 'id')::uuid from q where name = 'biz')),
          'Pat Partner|+910000002503|Hello', 'owner lists pending application with applicant details');
select is(api.decide_partner((select (r ->> 'id')::uuid from q where name = 'biz'), false, 'Need more info') ->> 'status',
          'rejected', 'owner rejects');
select throws_ok($$select api.decide_partner((select (r ->> 'id')::uuid from q where name = 'biz'), false)$$,
                 'PT409', 'CONFLICT', 'only pending can be rejected');
select throws_ok($$select api.revoke_partner((select (r ->> 'id')::uuid from q where name = 'biz'))$$,
                 'PT409', 'CONFLICT', 'only approved can be revoked');
select is(api.decide_partner((select (r ->> 'id')::uuid from q where name = 'biz'), true) ->> 'status',
          'approved', 'owner approves after rejection');
select throws_ok($$select api.decide_partner((select (r ->> 'id')::uuid from q where name = 'biz'), true)$$,
                 'PT409', 'CONFLICT', 'already approved');
select ok((select is_active from public.businesses where id = (select (r ->> 'id')::uuid from q where name = 'biz')),
          'approval activates the business');
select throws_ok($$select api.update_business((select (r ->> 'id')::uuid from q where name = 'biz'), '{"is_active":false}')$$,
                 'PT409', 'CONFLICT', 'partner activation only through decisions');
select throws_ok($$select api.decide_partner('b1000000-0000-0000-0000-0000000025b1', true)$$,
                 'PT404', 'NOT_FOUND', 'group business has no application');
reset role;
select throws_ok($$select api.svc_staff_upsert('a0000000-0000-0000-0000-0000000025aa', 'c1000000-0000-0000-0000-0000000025c1',
                   'executive', (select (r ->> 'id')::uuid from q where name = 'biz'), 'X')$$,
                 'PT400', 'VALIDATION_FAILED', 'no executives for partner businesses');
select throws_ok($$select api.svc_staff_upsert('a0000000-0000-0000-0000-0000000025aa', '9a000000-0000-0000-0000-00000000259a',
                   'executive', 'b1000000-0000-0000-0000-0000000025b1', 'X')$$,
                 'PT409', 'CONFLICT', 'partner account cannot be reassigned');

-- ---------------------------------------------------------------- approved partner
set local request.jwt.claims = '{"sub":"9a000000-0000-0000-0000-00000000259a","role":"authenticated","session_id":"59a00000-0000-0000-0000-00000000259a"}';
select is(api.get_my_staff() ->> 'partner_status', 'approved', 'get_my_staff: approved');
insert into q values ('o', api.upsert_offer(jsonb_build_object('business_id', (select r ->> 'id' from q where name = 'biz'),
  'title', 'Flights 10% off')));
select is(api.set_offer_status((select (r ->> 'offer_id')::uuid from q where name = 'o'), 'active') ->> 'status',
          'active', 'partner publishes own offer');
-- Owner pause lock: only the owner can republish an offer the owner paused.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000025aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000025aa"}';
select api.set_offer_status((select (r ->> 'offer_id')::uuid from q where name = 'o'), 'paused');
select ok((select owner_paused from public.offers where id = (select (r ->> 'offer_id')::uuid from q where name = 'o')), 'owner pause sets the lock');
set local request.jwt.claims = '{"sub":"9a000000-0000-0000-0000-00000000259a","role":"authenticated","session_id":"59a00000-0000-0000-0000-00000000259a"}';
select throws_ok($$select api.set_offer_status((select (r ->> 'offer_id')::uuid from q where name = 'o'), 'active')$$,
                 'PT409', 'CONFLICT', 'partner cannot republish an owner-paused offer');
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000025aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000025aa"}';
select api.set_offer_status((select (r ->> 'offer_id')::uuid from q where name = 'o'), 'active');
select ok(not (select owner_paused from public.offers where id = (select (r ->> 'offer_id')::uuid from q where name = 'o')), 'owner republish clears the lock');
set local request.jwt.claims = '{"sub":"9a000000-0000-0000-0000-00000000259a","role":"authenticated","session_id":"59a00000-0000-0000-0000-00000000259a"}';
select api.set_offer_status((select (r ->> 'offer_id')::uuid from q where name = 'o'), 'paused');
select is(api.set_offer_status((select (r ->> 'offer_id')::uuid from q where name = 'o'), 'active') ->> 'status', 'active', 'partner republishes an offer it paused itself');
select throws_ok($$select api.upsert_offer('{"business_id":"b1000000-0000-0000-0000-0000000025b1","title":"Nope"}')$$,
                 'PT403', 'FORBIDDEN', 'partner cannot create offers for a group business');
select is((select count(*)::int from api.list_offers((select (r ->> 'id')::uuid from q where name = 'biz'))), 1,
          'partner lists own offers');
select throws_ok($$select * from api.list_offers()$$, 'PT403', 'FORBIDDEN', 'partner cannot list all offers');
select ok(api.has_permission('claim.redeem', (select (r ->> 'id')::uuid from q where name = 'biz'))
          and not api.has_permission('card.approve', (select (r ->> 'id')::uuid from q where name = 'biz')),
          'partner redeems but cannot approve cards');
select ok(api.storage_can_write('offer-banners', (select r ->> 'id' from q where name = 'biz') || '/banner.png'),
          'partner can upload own banners');

-- ---------------------------------------------------------------- customer side
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000025c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000025c1"}';
select is((select kind from api.list_businesses() where name = 'Sky Trips'), 'partner', 'list_businesses returns kind');
select ok(exists (select 1 from api.list_eligible_offers() where id = (select (r ->> 'offer_id')::uuid from q where name = 'o')),
          'member sees partner offer');

-- ---------------------------------------------------------------- revoke
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000025aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000025aa"}';
insert into q values ('rev', api.revoke_partner((select (r ->> 'id')::uuid from q where name = 'biz'), 'Contract ended'));
select is((select (r ->> 'offers_paused')::int from q where name = 'rev'), 1, 'revoke pauses active offers');
select is((select status::text from public.offers where id = (select (r ->> 'offer_id')::uuid from q where name = 'o')), 'paused',
          'partner offer paused');
select ok(not (select is_active from public.businesses where id = (select (r ->> 'id')::uuid from q where name = 'biz')),
          'revoke deactivates the business');

set local request.jwt.claims = '{"sub":"9a000000-0000-0000-0000-00000000259a","role":"authenticated","session_id":"59a00000-0000-0000-0000-00000000259a"}';
select ok(not api.has_permission('offer.manage', (select (r ->> 'id')::uuid from q where name = 'biz')), 'revoked partner loses offer.manage');
select is(api.get_my_staff() ->> 'decision_note', 'Contract ended', 'partner sees the owner note');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000025aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000025aa"}';
select is(api.decide_partner((select (r ->> 'id')::uuid from q where name = 'biz'), true, 'Welcome back') ->> 'status',
          'approved', 'owner reinstates a revoked partner');
reset role;
select is((select count(*)::int from audit.audit_logs where entity_type = 'partner_application'
           and entity_id = (select (r ->> 'id')::uuid from q where name = 'biz')), 5,
          'sign-up and every decision audited');

select * from finish();
rollback;
